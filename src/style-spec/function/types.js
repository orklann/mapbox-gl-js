// @flow

export type Type = PrimitiveType | ArrayType // eslint-disable-line no-use-before-define

export type PrimitiveType = { kind: 'primitive', name: string }
export type ArrayType = { kind: 'array', name: string, itemType: Type, N: ?number }

const NullType = primitive('Null');
const NumberType = primitive('Number');
const StringType = primitive('String');
const BooleanType = primitive('Boolean');
const ColorType = primitive('Color');
const ObjectType = primitive('Object');
const ValueType = primitive('Value');

function primitive(name) : PrimitiveType {
    return { kind: 'primitive', name };
}

function array(itemType: Type, N: ?number) : ArrayType {
    return {
        kind: 'array',
        name: typeof N === 'number' ? `Array<${itemType.name}, ${N}>` : itemType === ValueType ? 'Array' : `Array<${itemType.name}>`,
        itemType,
        N
    };
}

const types = {
    'Null': NullType,
    'String': StringType,
    'Number': NumberType,
    'Boolean': BooleanType,
    'Object': ObjectType,
    'Color': ColorType,
    'Value': ValueType
};

const arrayPattern = /^Array(<([^,>]+)(\s*,\s*([0-9])+)?>)?$/;
function parseType (type: string): Type | null {
    if (types[type]) {
        return types[type];
    }

    const match = arrayPattern.exec(type);
    // Consider caching this so we don't reparse "Array<...>" repeatedly.
    if (match) {
        const itemType = parseType(match[2] || 'Value');
        if (!itemType) return null;
        const N = match[4] ? parseInt(match[4], 10) : undefined;
        return array(itemType, N);
    }
    return null;
}

module.exports = {
    NullType,
    NumberType,
    StringType,
    BooleanType,
    ColorType,
    ObjectType,
    ValueType,
    array,
    parseType
};
