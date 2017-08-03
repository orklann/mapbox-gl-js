// @flow

const assert = require('assert');
const compileExpression = require('./compile');
const convert = require('./convert');
const {
    ColorType,
    StringType,
    NumberType,
    BooleanType,
    ValueType,
    array
} = require('./types');
const {CompoundExpression} = require('./compound_expression');
const Curve = require('./definitions/curve');
const Coalesce = require('./definitions/coalesce');
const Let = require('./definitions/let');

import type {Expression} from './expression';

export type StyleFunction = (zoom?: number, featureProperties?: {}) => any;

type FunctionSpecification = {|
    type: 'identity',
    property: string
|} | {|
    type: 'categorical' | 'exponential' | 'interval',
    property?: string,
    stops: Array<[mixed, mixed]>
|} | {|
    expression: Array<mixed>
|};

type StylePropertySpecification = {
    type: 'number',
    default?: number
} | {
    type: 'string',
    default?: string
} | {
    type: 'boolean',
    default?: boolean
} | {
    type: 'enum',
    values: {[string]: {}},
    default?: string
} | {
    type: 'array',
    value: 'number' | 'string' | 'boolean',
    length?: number,
    default?: Array<mixed>
};

function createFunction(parameters: FunctionSpecification, propertySpec: StylePropertySpecification) {
    let expr;
    if (!isFunctionDefinition(parameters)) {
        expr = convert.value(parameters, propertySpec);
    } else if (parameters.expression) {
        const defaultValue = (typeof propertySpec.default !== 'undefined') ?
            convert.value(propertySpec.default, propertySpec) :
            null;
        expr = ['coalesce', parameters.expression, defaultValue];
    } else {
        expr = convert.function(parameters, propertySpec);
    }

    const expectedType = getExpectedType(propertySpec);
    const compiled = compileExpression(expr, expectedType);
    if (compiled.result === 'success') {
        const f: StyleFunction = function (zoom, properties) {
            const val = compiled.function({zoom}, {properties});
            return val === null ? undefined : val;
        };
        f.isFeatureConstant = compiled.isFeatureConstant;
        f.isZoomConstant = compiled.isZoomConstant;
        if (!f.isZoomConstant) {
            // capture metadata from the curve definition that's needed for
            // our prepopulate-and-interpolate approach to paint properties
            // that are zoom-and-property dependent.
            const curve = findZoomCurve(compiled.expression);
            if (!(curve instanceof Curve)) {
                // should be prevented by validation.
                throw new Error(curve ? curve.error : 'Invalid zoom expression');
            }
            const serialized = curve.serialize();
            const interpolation = serialized[1];

            f.zoomStops = [];
            for (const stop of curve.stops) {
                f.zoomStops.push(stop[0]);
            }

            if (!f.isFeatureConstant) {
                const interpExpression = ['curve', interpolation, ['zoom']];
                for (let i = 0; i < f.zoomStops.length; i++) {
                    interpExpression.push(f.zoomStops[i], i);
                }
                const interpFunction = compileExpression(
                    ['coalesce', interpExpression, 0],
                    NumberType
                );

                if (interpFunction.result === 'success') {
                    f.interpolationT = interpFunction.function;
                }
                assert(f.interpolationT);
            }
        }
        return f;
    } else {
        console.log(JSON.stringify(expr, null, 2));
        for (const err of compiled.errors) {
            console.log(`${err.key}: ${err.message}`);
        }
        throw new Error(compiled.errors.map(err => `${err.key}: ${err.message}`).join(', '));
    }
}

module.exports = createFunction;
module.exports.isFunctionDefinition = isFunctionDefinition;
module.exports.getExpectedType = getExpectedType;
module.exports.findZoomCurve = findZoomCurve;

// Zoom-dependent expressions may only use ["zoom"] as the input to a
// 'top-level' "curve" expression. (The curve may be wrapped in one or more
// "let" or "coalesce" expressions.)
function findZoomCurve(expression: Expression): null | Curve | {key: string, error: string} {
    if (expression instanceof Curve) {
        const input = expression.input;
        if (input instanceof CompoundExpression && input.name === 'zoom') {
            return expression;
        } else {
            return null;
        }
    } else if (expression instanceof Let) {
        return findZoomCurve(expression.result);
    } else if (expression instanceof Coalesce) {
        let result = null;
        for (const arg of expression.args) {
            const e = findZoomCurve(arg);
            if (!e) {
                continue;
            } else if (e.error) {
                return e;
            } else if (e instanceof Curve && !result) {
                result = e;
            } else {
                return {
                    key: e.key,
                    error: 'Only one zoom-based curve may be used in a style function.'
                };
            }
        }

        return result;
    } else {
        return null;
    }
}

function isFunctionDefinition(value): boolean {
    return typeof value === 'object' &&
        Boolean(value.expression || value.stops || value.type === 'identity');
}

function getExpectedType(spec) {
    const types = {
        color: ColorType,
        string: StringType,
        number: NumberType,
        enum: StringType,
        boolean: BooleanType
    };

    if (spec.type === 'array') {
        return array(types[spec.value] || ValueType, spec.length);
    }

    return types[spec.type];
}

