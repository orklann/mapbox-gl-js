// @flow

const Buffer = require('../data/buffer');
const VertexArrayObject = require('./vertex_array_object');
const PosArray = require('../data/pos_array');
const glMatrix = require('@mapbox/gl-matrix');
const pattern = require('./pattern');
const mat3 = glMatrix.mat3;
const vec3 = glMatrix.vec3;
const mat4 = glMatrix.mat4;

import type Painter from './painter';
import type SourceCache from '../source/source_cache';
import type FillExtrusionStyleLayer from '../style/style_layer/fill_extrusion_style_layer';
import type TileCoord from '../source/tile_coord';

module.exports = draw;

function draw(painter: Painter, source: SourceCache, layer: FillExtrusionStyleLayer, coords: Array<TileCoord>) {
    const gl = painter.gl;

    if (painter.renderPass === '3d') {
        gl.disable(gl.STENCIL_TEST);
        gl.enable(gl.DEPTH_TEST);

        painter.clearColor();
        painter.depthMask(true);

        for (let i = 0; i < coords.length; i++) {
            drawExtrusion(painter, source, layer, coords[i]);
        }
    } else if (painter.renderPass === 'translucent') {
        drawExtrusionTexture(painter, layer);
    };
}

function drawExtrusionTexture(painter, layer) {
    const renderedTexture = painter._prerenderedTextures[layer.id];
    if (!renderedTexture) return;

    const gl = painter.gl;
    const program = painter.useProgram('extrusionTexture');

    gl.disable(gl.STENCIL_TEST);
    gl.disable(gl.DEPTH_TEST);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, renderedTexture.texture);

    gl.uniform1f(program.u_opacity, layer.paint['fill-extrusion-opacity']);
    gl.uniform1i(program.u_image, 0);

    const matrix = mat4.create();
    mat4.ortho(matrix, 0, painter.width, painter.height, 0, 0, 1);
    gl.uniformMatrix4fv(program.u_matrix, false, matrix);

    gl.uniform2f(program.u_world, gl.drawingBufferWidth, gl.drawingBufferHeight);

    renderedTexture.vao.bind(gl, program, renderedTexture.buffer);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
}

function drawExtrusion(painter, source, layer, coord) {
    const tile = source.getTile(coord);
    const bucket = tile.getBucket(layer);
    if (!bucket) return;

    const buffers = bucket.buffers;
    const gl = painter.gl;

    const image = layer.paint['fill-extrusion-pattern'];

    const layerData = buffers.layerData[layer.id];
    const programConfiguration = layerData.programConfiguration;
    const program = painter.useProgram(image ? 'fillExtrusionPattern' : 'fillExtrusion', programConfiguration);
    programConfiguration.setUniforms(gl, program, layer, {zoom: painter.transform.zoom});

    if (image) {
        if (pattern.isPatternMissing(image, painter)) return;
        pattern.prepare(image, painter, program);
        pattern.setTile(tile, painter, program);
        gl.uniform1f(program.u_height_factor, -Math.pow(2, coord.z) / tile.tileSize / 8);
    }

    painter.gl.uniformMatrix4fv(program.u_matrix, false, painter.translatePosMatrix(
        coord.posMatrix,
        tile,
        layer.paint['fill-extrusion-translate'],
        layer.paint['fill-extrusion-translate-anchor']
    ));

    setLight(program, painter);

    for (const segment of buffers.segments) {
        segment.vaos[layer.id].bind(gl, program, buffers.layoutVertexBuffer, buffers.elementBuffer, layerData.paintVertexBuffer, segment.vertexOffset);
        gl.drawElements(gl.TRIANGLES, segment.primitiveLength * 3, gl.UNSIGNED_SHORT, segment.primitiveOffset * 3 * 2);
    }
}

function setLight(program, painter) {
    const gl = painter.gl;
    const light = painter.style.light;

    const _lp = light.calculated.position,
        lightPos = [_lp.x, _lp.y, _lp.z];
    const lightMat = mat3.create();
    if (light.calculated.anchor === 'viewport') mat3.fromRotation(lightMat, -painter.transform.angle);
    vec3.transformMat3(lightPos, lightPos, lightMat);

    gl.uniform3fv(program.u_lightpos, lightPos);
    gl.uniform1f(program.u_lightintensity, light.calculated.intensity);
    gl.uniform3fv(program.u_lightcolor, light.calculated.color.slice(0, 3));
}
