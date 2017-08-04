'use strict';

require('flow-remove-types/register');
const util = require('../src/util/util');
const expressionSuite = require('./integration').expression;
const compileExpression = require('../src/style-spec/function/compile');
const {parseType} = require('../src/style-spec/function/types');

let tests;

if (process.argv[1] === __filename && process.argv.length > 2) {
    tests = process.argv.slice(2);
}

expressionSuite.run('js', {tests: tests}, (fixture) => {
    let type;
    if (fixture.expectExpressionType) {
        type = parseType(fixture.expectExpressionType);
    }
    const compiled = compileExpression(fixture.expression, type);

    const result = {
        compiled: util.pick(compiled, ['result', 'functionSource', 'isFeatureConstant', 'isZoomConstant', 'errors'])
    };
    if (compiled.result === 'success') {
        result.compiled.type = compiled.expression.type.name;

        const evaluate = fixture.inputs || [];
        const evaluateResults = [];
        for (const input of evaluate) {
            try {
                const output = compiled.function.apply(null, input);
                evaluateResults.push(output);
            } catch (error) {
                if (error.name === 'ExpressionEvaluationError') {
                    evaluateResults.push({ error: error.toJSON() });
                } else {
                    evaluateResults.push({ error: error.message });
                }
            }
        }
        if (fixture.inputs) {
            result.outputs = evaluateResults;
        }
    } else {
        result.compiled.errors = result.compiled.errors.map((err) => ({
            key: err.key,
            error: err.message
        }));
    }

    return result;
});
