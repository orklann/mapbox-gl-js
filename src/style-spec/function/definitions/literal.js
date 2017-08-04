// @flow

const { Color, isValue, typeOf } = require('../values');

import type { Type } from '../types';
import type { Value }  from '../values';
import type { Expression, ParsingContext }  from '../expression';

class Literal implements Expression {
    key: string;
    type: Type;
    value: Value;

    constructor(key: *, type: Type, value: Value) {
        this.key = key;
        this.type = type;
        this.value = value;
    }

    static parse(args: Array<mixed>, context: ParsingContext, expectedType?: ?Type) {
        if (args.length !== 2)
            return context.error(`'literal' expression requires exactly one argument, but found ${args.length - 1} instead.`);

        if (!isValue(args[1]))
            context.error(`invalid value`);

        const value = (args[1] : any);
        let type = typeOf(value);

        // special case: infer the item type if possible for zero-length arrays
        if (
            type.kind === 'array' &&
            type.N === 0 &&
            expectedType &&
            expectedType.kind === 'array' &&
            (typeof expectedType.N !== 'number' || expectedType.N === 0)
        ) {
            type = expectedType;
        }

        return new Literal(context.key, type, value);
    }

    typecheck() {
        return this;
    }

    compile() {
        const value = JSON.stringify(this.value);
        return typeof this.value === 'object' ?  `(${value})` : value;
    }

    serialize() {
        if (this.value === null || typeof this.value === 'string' || typeof this.value === 'boolean' || typeof this.value === 'number') {
            return this.value;
        } else if (this.value instanceof Color) {
            return ["rgba"].concat(this.value.value);
        } else {
            return ["literal", this.value];
        }
    }

    accept(visitor: Visitor<Expression>) { visitor.visit(this); }
}

module.exports = Literal;
