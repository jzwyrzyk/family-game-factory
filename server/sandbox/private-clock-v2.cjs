// Planck's continuous-collision profiler calls Date.now(). Bind that clock privately before
// sealing Worker globals. The generated factory is a sibling of this closure and cannot see it.
// This prelude is part of each immutable worker archive and its reviewed digest.
module.exports={clockPrelude:'const Date=Object.freeze({now:globalThis.Date.now.bind(globalThis.Date)});'};
