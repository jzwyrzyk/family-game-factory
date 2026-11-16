// Positive ambient language surface shared by the source checker and trusted worker bootstrap.
// Browser/Worker interfaces, wall clocks, randomness from crypto, storage and host event APIs are absent.
const PURE_GLOBALS=Object.freeze(['Object','Array','Number','Boolean','String','Function','RegExp','Math','Map','Set','WeakMap','WeakSet','JSON','Reflect','Symbol','BigInt','Proxy','Promise','Error','TypeError','RangeError','SyntaxError','ReferenceError','URIError','EvalError','AggregateError','ArrayBuffer','DataView','Int8Array','Uint8Array','Uint8ClampedArray','Int16Array','Uint16Array','Int32Array','Uint32Array','Float32Array','Float64Array','BigInt64Array','BigUint64Array','parseInt','parseFloat','isFinite','isNaN','Infinity','NaN','undefined']);
module.exports={PURE_GLOBALS};
