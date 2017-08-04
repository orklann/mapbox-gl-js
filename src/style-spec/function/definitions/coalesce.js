// @flow

const assert = require('assert');
const { parseExpression } = require('../expression');

import type { Expression, ParsingContext } from '../expression';
import type { Type } from '../types';

class Coalesce implements Expression {
    key: string;
    type: Type;
    args: Array<Expression>;

    constructor(key: string, type: Type, args: Array<Expression>) {
        this.key = key;
        this.type = type;
        this.args = args;
    }

    static parse(args: Array<mixed>, context: ParsingContext, expectedType?: Type) {
        args = args.slice(1);
        let outputType = expectedType;
        const parsedArgs = [];
        for (const arg of args) {
            const argContext = context.concat(1 + parsedArgs.length, 'coalesce');
            const parsed = parseExpression(arg, argContext, outputType);
            if (!parsed) return null;
            outputType = outputType || parsed.type;
            parsedArgs.push(parsed);
        }
        assert(outputType);
        return new Coalesce(context.key, (outputType: any), parsedArgs);
    }

    compile() {
        return `this.coalesce(${this.args.map(a => `function () { return ${a.compile()} }.bind(this)`).join(', ')})`;
    }

    serialize() {
        return ['coalesce'].concat(this.args.map(a => a.serialize()));
    }

    accept(visitor: Visitor<Expression>) {
        visitor.visit(this);
        for (const arg of this.args) {
            arg.accept(visitor);
        }
    }
}

module.exports = Coalesce;
