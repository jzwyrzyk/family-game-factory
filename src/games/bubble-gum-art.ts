/** Local vector objects. Tray, blueprint and travelling invention share these exact drawings. */
const svg = (shapes: string) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" class="gum-object-svg" focusable="false" aria-hidden="true"><g stroke-linecap="round" stroke-linejoin="round">${shapes}</g></svg>`;
const piece = <Id extends string>(id: Id, name: string, shapes: string) => ({ id, name, svg: svg(shapes) });

export const OBJECTS = {
  bottle: piece('bottle', 'Bottle', `
    <path d="M45 23h30v13c0 10 17 12 19 27v36q0 12-13 12H39q-13 0-13-12V63c2-15 19-17 19-27Z" fill="#9ae0ed" stroke="#366487" stroke-width="3.5"/>
    <path d="M76 37c1 11 12 12 14 26v34q0 9-10 9H70V44Z" fill="#6abfda"/>
    <path d="M36 58v37" stroke="#eaffff" stroke-width="7"/><path d="M29 67h61M29 94h61" stroke="#68b9d4" stroke-width="3"/>
    <rect x="28" y="68" width="64" height="24" rx="6" fill="#fff8d8" stroke="#38708c" stroke-width="2.5"/>
    <path d="M35 81q10-9 20 0t21 0" fill="none" stroke="#ee9c5c" stroke-width="4"/>
    <circle cx="78" cy="78" r="5" fill="#ffc759"/>
    <rect x="41" y="10" width="38" height="17" rx="4" fill="#a993ed" stroke="#61529c" stroke-width="3.5"/>
    <path d="M49 14v8m10-8v8m10-8v8" stroke="#e4d7ff" stroke-width="3"/>
  `),
  can: piece('can', 'Tin can', `
    <path d="M22 27h76v68c0 12-76 12-76 0Z" fill="#b8d5e5" stroke="#526880" stroke-width="3.5"/>
    <path d="M80 29h15v65q-2 6-15 7Z" fill="#88adc8"/>
    <path d="M30 34v57" stroke="#eff9ff" stroke-width="5"/>
    <path d="M24 38q36 8 72 0m-72 52q36 8 72 0" fill="none" stroke="#7298b2" stroke-width="3"/>
    <path d="M23 46q37 9 74 0v34q-37 10-74 0Z" fill="#ffad84" stroke="#c47769" stroke-width="2.5"/>
    <ellipse cx="60" cy="63" rx="21" ry="15" fill="#fff1c9"/>
    <path d="M58 52c-12 0-12 21 0 21 12 0 20-21 0-21Z" fill="#85c5a1" stroke="#518c72" stroke-width="2.5"/>
    <ellipse cx="60" cy="25" rx="38" ry="12" fill="#eaf5fb" stroke="#526880" stroke-width="3.5"/>
    <ellipse cx="60" cy="25" rx="28" ry="6" fill="#a7c8dc" stroke="#7198b2" stroke-width="2"/>
    <path d="M49 25h22" stroke="#eaf5fb" stroke-width="4"/>
    <path d="M23 99q37 13 74 0" fill="none" stroke="#e6f5fd" stroke-width="4"/>
  `),
  box: piece('box', 'Box', `
    <path d="M16 37 61 22l44 16v59l-44 15-45-16Z" fill="#eec58d" stroke="#967046" stroke-width="3.5"/>
    <path d="M61 52 105 38v59l-44 15Z" fill="#d2a570"/>
    <path d="M16 37 61 52l44-14M61 52v60" fill="none" stroke="#967046" stroke-width="3"/>
    <path d="M16 37 6 21l44-13 11 14-10 15Zm45-15L74 8l39 15-8 15-32 9Z" fill="#f9dba6" stroke="#967046" stroke-width="3.5"/>
    <path d="m38 44 14 5v48l-14-5Z" fill="#fff0bb"/>
    <path d="m69 70 24-8m-24 14 24-8" stroke="#ac7d49" stroke-width="2.5"/>
    <path d="M24 58v24" stroke="#ffe6bb" stroke-width="4"/>
    <path d="m72 95 12-4v-9m-12 13v-9" fill="none" stroke="#8c674b" stroke-width="2.5"/>
  `),
  cup: piece('cup', 'Paper cup', `
    <path d="m20 24 13 77q2 10 27 10t27-10l13-77" fill="#fff3d9" stroke="#bd8b65" stroke-width="3.5"/>
    <path d="m85 30-11 74q8-1 11-6l13-72Z" fill="#f0d0a0"/>
    <path d="m25 48 5 28q29 10 60 0l5-28q-35 11-70 0Z" fill="#ffae8c" stroke="#db916c" stroke-width="2.5"/>
    <path d="m34 52 4 24m12-21 2 23m13-23v23m14-25-2 24" stroke="#fff0d7" stroke-width="5"/>
    <ellipse cx="60" cy="24" rx="41" ry="14" fill="#fff9e9" stroke="#bd8b65" stroke-width="3.5"/>
    <ellipse cx="60" cy="24" rx="30" ry="7" fill="#dab59a"/>
    <path d="m38 85 2 12" stroke="#fff" stroke-width="5"/>
  `),
  teacup: piece('teacup', 'Teacup', `
    <ellipse cx="55" cy="105" rx="43" ry="7" fill="#bac5e6"/>
    <path d="M83 39h11c29 0 28 44-4 45H77" fill="#c6bbf4" stroke="#6d64a4" stroke-width="4"/>
    <path d="M86 49h8c13 0 12 24-5 25h-7" fill="#fff8ee" stroke="#6d64a4" stroke-width="3"/>
    <path d="M14 33h73v34q0 34-36 34T14 67Z" fill="#cfc3f8" stroke="#6d64a4" stroke-width="3.5"/>
    <path d="M73 39h12v28q0 27-28 31 17-14 16-40Z" fill="#a994df"/>
    <ellipse cx="51" cy="33" rx="37" ry="12" fill="#f7efff" stroke="#6d64a4" stroke-width="3.5"/>
    <ellipse cx="51" cy="34" rx="28" ry="6" fill="#c3947f"/>
    <path d="M25 49v18" stroke="#fff" stroke-width="5"/>
    <path d="M51 83C30 70 35 59 44 60q5-1 7 5 3-6 8-5c10-1 14 10-8 23Z" fill="#ffb3c9" stroke="#a36b9a" stroke-width="2.5"/>
  `),
  sponge: piece('sponge', 'Sponge', `
    <path d="M13 37q-2-10 11-10h73q13 0 12 12l-4 50q-1 11-15 11H25q-14 0-15-11Z" fill="#68bda1" stroke="#4c8677" stroke-width="3.5"/>
    <path d="M12 29q0-10 13-10h72q13 1 13 13l-5 46q-1 12-13 12H23q-13-1-13-13Z" fill="#ffdb72" stroke="#b99145" stroke-width="3.5"/>
    <path d="M18 30q0-5 10-5h62" stroke="#fff4bd" stroke-width="6" fill="none"/>
    <g fill="#e5b24b" stroke="#c99a3c" stroke-width="2"><ellipse cx="30" cy="47" rx="8" ry="6"/><ellipse cx="72" cy="39" rx="6" ry="4"/><ellipse cx="88" cy="65" rx="8" ry="6"/><ellipse cx="49" cy="72" rx="6" ry="5"/><circle cx="56" cy="48" r="3"/><circle cx="26" cy="72" r="3"/></g>
    <path d="m22 95 6 3m11-3 7 3m11-3 7 3m11-3 7 3" stroke="#aad9b4" stroke-width="2.5"/>
  `),
  shoe: piece('shoe', 'Sneaker', `
    <path d="M12 66V32q17-7 29 3l14 21 28 9q23 4 24 24H13Z" fill="#ff9cb2" stroke="#995d7b" stroke-width="3.5"/>
    <path d="M12 37q12 8 27-2l7 12q-12 14-34 6Z" fill="#d56b94"/>
    <path d="m42 43 18 22 20 7-11 13-37-19Z" fill="#f6e7e3" stroke="#995d7b" stroke-width="3"/>
    <path d="m42 50 15-3m-10 11 17-3m-10 12 17-3" stroke="#735b86" stroke-width="3.5"/>
    <path d="M75 70q28 0 32 18H68Z" fill="#fff7e9" stroke="#a4818f" stroke-width="3"/>
    <path d="M11 87h96v13q-43 13-96 0Z" fill="#fff7e9" stroke="#995d7b" stroke-width="3.5"/>
    <path d="M19 96h80" stroke="#ccb8b8" stroke-width="2.5"/>
    <path d="m21 68 6 7 6-7" stroke="#fff0f2" stroke-width="4" fill="none"/>
  `),
  funnel: piece('funnel', 'Funnel', `
    <path d="M11 25 48 73v29l24 10V73l37-48" fill="#c4aff3" stroke="#72599e" stroke-width="3.5"/>
    <path d="m86 29-23 43v31l8 4V73l34-43Z" fill="#a088d8"/>
    <ellipse cx="60" cy="25" rx="49" ry="15" fill="#dfcef9" stroke="#72599e" stroke-width="3.5"/>
    <ellipse cx="60" cy="25" rx="35" ry="7" fill="#a38bd0" stroke="#8c73b9" stroke-width="2.5"/>
    <path d="m29 44 17 23m9 13v17" stroke="#eee3ff" stroke-width="5"/>
    <path d="m48 102 24 10" stroke="#705691" stroke-width="4"/>
  `),
  spoon: piece('spoon', 'Spoon', `
    <path d="M51 48h18l3 56q0 10-12 10t-12-10Z" fill="#dcc098" stroke="#94734f" stroke-width="3.5"/>
    <path d="m62 60 2 42" stroke="#b99569" stroke-width="4"/>
    <ellipse cx="60" cy="32" rx="28" ry="28" fill="#eacba2" stroke="#94734f" stroke-width="3.5"/>
    <ellipse cx="60" cy="31" rx="19" ry="19" fill="#c7a27b"/>
    <path d="M44 30q0-15 15-17" fill="none" stroke="#fff0cb" stroke-width="4"/>
    <path d="m54 65-1 33" stroke="#f8e1b8" stroke-width="3"/>
  `),
  fork: piece('fork', 'Fork', `
    <path d="M35 9h8v27h12V8h10v28h12V9h8v32q0 17-16 20l3 43q0 10-12 10t-12-10l3-43Q35 58 35 41Z" fill="#b5d9e7" stroke="#5d7996" stroke-width="3.5"/>
    <path d="M43 44q17 14 34 0" stroke="#eafaff" stroke-width="4" fill="none"/>
    <path d="m57 70-1 30" stroke="#eafaff" stroke-width="4"/>
    <path d="m64 69 1 34" stroke="#8cb8ce" stroke-width="3"/>
  `),
  ruler: piece('ruler', 'Ruler', `
    <rect x="7" y="35" width="106" height="49" rx="7" fill="#f6cc7b" stroke="#ae7d43" stroke-width="3.5"/>
    <path d="M10 76h100v5H10Z" fill="#dba654"/>
    <path d="M17 36v21m10-21v12m10-12v21m10-21v12m10-12v21m10-21v12m10-12v21m10-21v12m10-12v21" stroke="#8b623c" stroke-width="2.5"/>
    <path d="M19 66h9m11 0h8m12 0h8m12 0h8" stroke="#aa7c4a" stroke-width="3"/>
    <circle cx="102" cy="66" r="4" fill="#fff5d7" stroke="#ae7d43" stroke-width="2"/>
  `),
  straw: piece('straw', 'Straw', `
    <path d="M43 109V40q0-12 11-18l33-16 8 15-32 16v72Z" fill="#a1e0bf" stroke="#528e83" stroke-width="3.5"/>
    <path d="M50 106V43q0-13 14-18l21-10" stroke="#d9ffe6" stroke-width="5" fill="none"/>
    <path d="m45 40 17 1m-17-9 16 3m-11-11 15 6m-7-12 12 8" stroke="#68ab93" stroke-width="2.5"/>
    <ellipse cx="91" cy="13" rx="5" ry="9" transform="rotate(-24 91 13)" fill="#5b9a85" stroke="#528e83" stroke-width="2"/>
  `),
  balloon: piece('balloon', 'Balloon', `
    <path d="M60 86q16 12 1 20-7 4 1 9" fill="none" stroke="#876a94" stroke-width="2.5"/>
    <path d="m59 79-8 12h19l-8-12" fill="#e879aa" stroke="#a75a8e" stroke-width="3"/>
    <path d="M98 43c0 28-25 43-38 43S22 71 22 43C22 18 39 5 60 5s38 13 38 38Z" fill="#f3a0c4" stroke="#aa5f94" stroke-width="3.5"/>
    <path d="M83 18c21 29 2 58-22 66 23-1 37-22 37-41 0-13-6-21-15-25Z" fill="#df7eb0"/>
    <path d="M35 39q0-18 18-23" fill="none" stroke="#ffe4ed" stroke-width="8"/>
    <circle cx="36" cy="52" r="4" fill="#ffe4ed"/>
  `),
  fan: piece('fan', 'Fan', `
    <path d="M52 78h16l5 23H47Z" fill="#a58ace" stroke="#6c5a99" stroke-width="3"/>
    <path d="M31 103q29-12 58 0v10H31Z" fill="#b5a0e8" stroke="#6c5a99" stroke-width="3.5"/>
    <circle cx="60" cy="44" r="37" fill="#d9edf8" stroke="#5d799b" stroke-width="4"/>
    <circle cx="60" cy="44" r="30" fill="#effaff" stroke="#99b9d0" stroke-width="2"/>
    <path d="M59 41C39 37 43 15 58 18c13 2 15 16 4 24M64 45c11-18 31-6 21 7-8 10-20 7-23-3M57 47c10 17-11 29-19 15-6-10 2-20 17-18" fill="#78cdbd" stroke="#459b97" stroke-width="2.5"/>
    <path d="M24 44h72M60 8v72M35 18l50 52M35 71l50-53" stroke="#a4c1d4" stroke-width="1.5" opacity=".8"/>
    <circle cx="60" cy="44" r="8" fill="#f8d98c" stroke="#ae9365" stroke-width="3"/>
    <circle cx="76" cy="105" r="3" fill="#f5ca72"/>
  `),
  lid: piece('lid', 'Bottle cap', `
    <path d="m60 7 11 6 12-1 6 10 12 4 1 13 8 9-4 12 4 12-8 9-1 13-12 4-6 10-12-1-11 6-11-6-12 1-6-10-12-4-1-13-8-9 4-12-4-12 8-9 1-13 12-4 6-10 12 1Z" fill="#f7ad99" stroke="#af6b75" stroke-width="3.5"/>
    <circle cx="60" cy="60" r="37" fill="#ffd1b6" stroke="#cf8a88" stroke-width="3"/>
    <circle cx="60" cy="60" r="29" fill="#f5baa2"/>
    <path d="M38 42q10-13 28-10" stroke="#ffe8ce" stroke-width="6" fill="none"/>
    <path d="m60 40 6 12 13 2-10 10 2 14-11-7-12 7 3-14-10-10 13-2Z" fill="#fff0c8" stroke="#c78a78" stroke-width="2.5"/>
  `),
  cd: piece('cd', 'CD', `
    <circle cx="60" cy="60" r="50" fill="#c6d6f2" stroke="#7584aa" stroke-width="3.5"/>
    <path d="M60 10a50 50 0 0 1 43 75L60 60Z" fill="#b5e9dd"/>
    <path d="M103 85a50 50 0 0 1-68 18l25-43Z" fill="#e6bded"/>
    <path d="M35 103A50 50 0 0 1 17 35l43 25Z" fill="#f7dfab"/>
    <circle cx="60" cy="60" r="42" fill="none" stroke="#fff" stroke-width="2" opacity=".55"/>
    <circle cx="60" cy="60" r="19" fill="#eaf4fd" stroke="#9b9fc2" stroke-width="3"/>
    <circle cx="60" cy="60" r="9" fill="#fff8ee" stroke="#8992ae" stroke-width="2.5"/>
    <path d="M29 38q10-16 27-17" stroke="#fff" stroke-width="5" fill="none" opacity=".85"/>
  `),
  wheel: piece('wheel', 'Toy wheel', `
    <circle cx="60" cy="60" r="49" fill="#536484" stroke="#344463" stroke-width="4"/>
    <circle cx="60" cy="60" r="39" fill="#6f82a2" stroke="#a1afc1" stroke-width="3"/>
    <circle cx="60" cy="60" r="28" fill="#c5b6ec" stroke="#333e60" stroke-width="4"/>
    <path d="M60 33v54M33 60h54M41 41l38 38m0-38L41 79" stroke="#8778b2" stroke-width="6"/>
    <circle cx="60" cy="60" r="12" fill="#f7d78d" stroke="#8e7e87" stroke-width="3"/>
    <path d="M27 38q11-18 31-20" stroke="#bac8d9" stroke-width="4" fill="none"/>
    <path d="M16 60h6m76 0h6M60 16v6m0 76v6" stroke="#a1afc1" stroke-width="3"/>
  `),
  button: piece('button', 'Button', `
    <circle cx="60" cy="60" r="48" fill="#e5ab5b" stroke="#a77646" stroke-width="3.5"/>
    <circle cx="58" cy="56" r="43" fill="#ffd789" stroke="#b78955" stroke-width="3"/>
    <circle cx="58" cy="56" r="31" fill="#efbf71" stroke="#d5a65b" stroke-width="3"/>
    <g fill="#876e7f" stroke="#b18856" stroke-width="2"><circle cx="47" cy="45" r="6"/><circle cx="69" cy="45" r="6"/><circle cx="47" cy="67" r="6"/><circle cx="69" cy="67" r="6"/></g>
    <path d="m47 45 22 22m0-22L47 67" stroke="#f9ecda" stroke-width="3.5"/>
    <path d="M29 36q11-15 28-15" stroke="#fff1bd" stroke-width="5" fill="none"/>
  `),
  'paper-wing': piece('paper-wing', 'Paper wing', `
    <path d="m7 57 105-40-30 89-26-27-20 12 6-31Z" fill="#e0f2ff" stroke="#698bb0" stroke-width="3.5"/>
    <path d="m42 60 70-43-56 62-20 12Z" fill="#a5cee9" stroke="#698bb0" stroke-width="3"/>
    <path d="m56 79 56-62-30 89Z" fill="#c2dff4" stroke="#698bb0" stroke-width="3"/>
    <path d="m20 55 65-25" stroke="#fff" stroke-width="4"/>
    <path d="m68 80 11 12" stroke="#eaf8ff" stroke-width="4"/>
  `),
  'paper-sail': piece('paper-sail', 'Paper sail', `
    <path d="M33 9v103" stroke="#9c7756" stroke-width="6"/>
    <path d="M33 14 103 90H33Z" fill="#b8e8d5" stroke="#5e9f97" stroke-width="3.5"/>
    <path d="m34 40 45 49H57L34 65Z" fill="#f7f8d8"/>
    <path d="m34 15 66 73-39-13Z" fill="#d7f5e7" opacity=".75"/>
    <path d="M29 35 11 87h18Z" fill="#ffd0d5" stroke="#b0819b" stroke-width="3"/>
    <path d="m35 96 67-1" stroke="#9c7756" stroke-width="4"/>
    <circle cx="33" cy="12" r="4" fill="#f2c881" stroke="#9c7756" stroke-width="2"/>
  `),
  'craft-stick': piece('craft-stick', 'Craft stick', `
    <rect x="43" y="6" width="34" height="108" rx="17" fill="#e8c696" stroke="#a97d50" stroke-width="3.5"/>
    <path d="M51 23v71" stroke="#ffe2b4" stroke-width="4"/>
    <path d="M63 17q-4 26 1 43t-1 39" stroke="#c79c65" stroke-width="2.5" fill="none"/>
    <path d="m69 41 1 16m-16 14-1 11" stroke="#d5ab79" stroke-width="2"/>
  `),
  spring: piece('spring', 'Spring', `
    <path d="M74 12c-41-5-54 8-32 18l36 14c18 9 6 19-35 15M43 59c-21 6-18 16 0 24l35 14c13 6 4 13-23 14" fill="none" stroke="#6a5b9f" stroke-width="11"/>
    <path d="M43 30c-22 5-19 17 0 25l35 14c18 9 6 19-35 15" fill="none" stroke="#6a5b9f" stroke-width="11"/>
    <path d="M74 12c-41-5-54 8-32 18l36 14c18 9 6 19-35 15M43 59c-21 6-18 16 0 24l35 14c13 6 4 13-23 14M43 30c-22 5-19 17 0 25l35 14c18 9 6 19-35 15" fill="none" stroke="#baa6e5" stroke-width="7"/>
    <path d="M35 20q2-7 18-7m-17 32q4-5 15-4m-15 30q4-5 15-4" fill="none" stroke="#f0e3ff" stroke-width="3"/>
  `),
  comb: piece('comb', 'Comb', `
    <path d="M12 32h96v19h-9v36h-7V51h-8v36h-7V51h-8v36h-7V51h-8v36h-7V51h-8v36h-7V51h-8v36h-7V51h-5Z" fill="#89d3c9" stroke="#4e928e" stroke-width="3.5"/>
    <path d="M21 39h77" stroke="#d2faf0" stroke-width="4"/>
    <path d="M25 57v23m30-23v23m30-23v23" stroke="#b6eee0" stroke-width="2"/>
  `),
  sock: piece('sock', 'Sock', `
    <path d="M42 12h40v51l14 8c20 13 10 37-13 37H44c-21 0-33-16-24-29l22-22Z" fill="#c3b1ee" stroke="#7a619e" stroke-width="3.5"/>
    <path d="M42 12h40v22H42Z" fill="#e1cef8" stroke="#7a619e" stroke-width="3"/>
    <path d="M50 17v12m9-12v12m10-12v12" stroke="#b19ad3" stroke-width="2.5"/>
    <path d="M87 68q20 5 20 20 0 16-22 20l-5-21Z" fill="#f6c899" stroke="#b48d8e" stroke-width="3"/>
    <path d="m24 73 18 9 9 26h-8q-31-3-19-35Z" fill="#f6c899" stroke="#b48d8e" stroke-width="3"/>
    <g fill="#eee2ff"><circle cx="58" cy="47" r="4"/><circle cx="69" cy="64" r="4"/><circle cx="55" cy="84" r="4"/></g>
  `),
  brush: piece('brush', 'Brush', `
    <path d="M49 62h22l5 43q0 10-16 10t-16-10Z" fill="#f4a1b3" stroke="#a76886" stroke-width="3.5"/>
    <path d="M54 78v20" stroke="#ffe2e5" stroke-width="4"/>
    <circle cx="60" cy="105" r="4" fill="#fff8ee" stroke="#a76886" stroke-width="2"/>
    <path d="M31 12h58l4 43H27Z" fill="#e9c692" stroke="#a4845c" stroke-width="3.5"/>
    <path d="M39 16 37 49m13-33-1 34m12-34v34m12-34 1 34m11-34 2 34" stroke="#bc986c" stroke-width="3"/>
    <path d="M29 50h62v19H29Z" fill="#c4dfec" stroke="#69859e" stroke-width="3.5"/>
    <path d="M35 57h49" stroke="#f1fbff" stroke-width="4"/>
    <path d="M31 12h12v8H31m25-8h12v6H56m20-6h13v9H76" fill="#9dc9ac" stroke="none"/>
  `),
  bowl: piece('bowl', 'Bowl', `
    <path d="M11 39h98c-4 47-18 63-49 63S15 86 11 39Z" fill="#f6a9bb" stroke="#a9698c" stroke-width="3.5"/>
    <path d="M88 45h19c-5 37-18 54-44 55 16-10 22-25 25-55Z" fill="#db87a9"/>
    <path d="M21 52q3 25 17 33" stroke="#ffe1e8" stroke-width="6" fill="none"/>
    <ellipse cx="60" cy="38" rx="49" ry="14" fill="#ffe8c2" stroke="#a9698c" stroke-width="3.5"/>
    <ellipse cx="60" cy="39" rx="37" ry="7" fill="#d7a4a5"/>
    <path d="M43 102h34" stroke="#a9698c" stroke-width="5"/>
    <circle cx="57" cy="74" r="5" fill="#fff0d7"/><circle cx="75" cy="71" r="4" fill="#fff0d7"/>
  `),
  basket: piece('basket', 'Basket', `
    <path d="M29 53V35c0-31 62-31 62 0v18" fill="none" stroke="#986c4f" stroke-width="12"/>
    <path d="M29 53V35c0-31 62-31 62 0v18" fill="none" stroke="#e9bd7b" stroke-width="6"/>
    <path d="m13 49 10 52q2 11 37 11t37-11l10-52Z" fill="#dfae72" stroke="#986c4f" stroke-width="3.5"/>
    <path d="m28 54 6 50m14-50 2 53m15-53-1 53m17-53-5 50m16-50-7 43M18 67h85M21 83h78M24 99h71" stroke="#bc8755" stroke-width="3"/>
    <path d="M27 60h65M29 76h60M32 92h54" stroke="#f8d49a" stroke-width="3"/>
    <path d="M12 47h96v12H12Z" fill="#f0c58a" stroke="#986c4f" stroke-width="3.5"/>
  `),
  cork: piece('cork', 'Cork', `
    <path d="m24 24 7 75c2 16 56 16 58 0l7-75" fill="#dbb27d" stroke="#9c784e" stroke-width="3.5"/>
    <path d="m80 25-4 77 11-4 7-73Z" fill="#bf925e"/>
    <ellipse cx="60" cy="24" rx="36" ry="13" fill="#f3d199" stroke="#9c784e" stroke-width="3.5"/>
    <path d="m35 36 4 50" stroke="#efcb95" stroke-width="4"/>
    <g fill="#b18452"><ellipse cx="46" cy="23" rx="4" ry="2"/><ellipse cx="68" cy="19" rx="3" ry="2"/><ellipse cx="77" cy="27" rx="3" ry="2"/><ellipse cx="53" cy="51" rx="3" ry="4"/><ellipse cx="69" cy="71" rx="3" ry="5"/><circle cx="45" cy="93" r="3"/><circle cx="69" cy="95" r="2"/></g>
  `),
  carton: piece('carton', 'Carton', `
    <path d="M27 34 43 12h34l17 22v76H27Z" fill="#f5e5d0" stroke="#947789" stroke-width="3.5"/>
    <path d="M77 12 94 34v76H77V35L64 12" fill="#d7bdcd"/>
    <path d="M27 34h67M43 12v15l17 7 17-7V12" fill="#e3b4ce" stroke="#947789" stroke-width="3"/>
    <path d="M28 47h49v49H28Z" fill="#b3ded8"/>
    <path d="M37 50h31" stroke="#f5ffff" stroke-width="3"/>
    <path d="M53 58c-7 11-14 17-14 24 0 16 29 16 29 0 0-7-8-13-15-24Z" fill="#fff5de" stroke="#77b4b2" stroke-width="2.5"/>
    <path d="M35 102h35" stroke="#d8bfaa" stroke-width="3"/>
    <path d="M45 12h29" stroke="#fcf0db" stroke-width="4"/>
  `),
  tube: piece('tube', 'Cardboard tube', `
    <path d="M29 22h62v79c0 18-62 18-62 0Z" fill="#d7b78e" stroke="#92704f" stroke-width="3.5"/>
    <path d="M74 24h15v77q-4 7-15 8Z" fill="#b99469"/>
    <ellipse cx="60" cy="22" rx="31" ry="13" fill="#edd0a5" stroke="#92704f" stroke-width="3.5"/>
    <ellipse cx="60" cy="22" rx="22" ry="7" fill="#97744f" stroke="#b38c61" stroke-width="2"/>
    <path d="M37 38v55" stroke="#edd0a5" stroke-width="5"/>
    <path d="m31 79 58-25m-58 52 58-25" stroke="#b28c63" stroke-width="2.5"/>
  `),
} as const;

export type ObjectId = keyof typeof OBJECTS;
export type GumColor = 'pink' | 'mint' | 'blue' | 'gold';
export type SceneWorld = 'sky' | 'sea' | 'road' | 'stage';

/** Visible bounds include each outline and a small antialias margin. Blueprint
 * slots describe the material itself, not the thumbnail's transparent padding. */
export const OBJECT_FRAMES = {
  bottle: [23, 6, 74, 109], can: [19, 9, 82, 100], box: [3, 4, 113, 112],
  cup: [15, 6, 90, 109], teacup: [10, 18, 109, 96], sponge: [6, 15, 108, 89],
  shoe: [8, 25, 103, 85], funnel: [8, 6, 104, 110], spoon: [29, 0, 62, 117],
  fork: [31, 4, 58, 113], ruler: [4, 31, 112, 56], straw: [39, 2, 61, 110],
  balloon: [19, 1, 82, 117], fan: [19, 4, 82, 112], lid: [6, 4, 108, 112],
  cd: [6, 6, 108, 108], wheel: [7, 7, 106, 106], button: [9, 9, 102, 102],
  'paper-wing': [4, 14, 112, 96], 'paper-sail': [8, 4, 98, 112],
  'craft-stick': [39, 3, 42, 114], spring: [20, 4, 73, 114], comb: [9, 29, 102, 62],
  sock: [14, 9, 97, 102], brush: [24, 9, 72, 110], bowl: [8, 20, 104, 86],
  basket: [9, 4, 102, 112], cork: [20, 8, 80, 107], carton: [24, 9, 73, 105],
  tube: [25, 5, 70, 113],
} as const satisfies Record<ObjectId, readonly [number, number, number, number]>;

export const GUM_PALETTE: Record<GumColor, { fill: string; shade: string; highlight: string }> = {
  pink: { fill: '#f58eba', shade: '#af4b87', highlight: '#ffe0ec' },
  mint: { fill: '#74d9b7', shade: '#387f70', highlight: '#d6ffec' },
  blue: { fill: '#80cafa', shade: '#467eaf', highlight: '#e1f5ff' },
  gold: { fill: '#f9cd68', shade: '#a27837', highlight: '#fff0ba' },
};

export function objectArt(id: ObjectId): string { return OBJECTS[id].svg; }

/** Fit the same drawing to a material-sized assembly slot. Clearly elongated
 * pieces turn internally to follow that slot; slot.rotation still owns the
 * final assembly angle. Cups, funnels, sails and other broad objects stay upright. */
export function objectArtFrame(id: ObjectId, width = 120, height = 120): string {
  const [x, y, w, h] = OBJECT_FRAMES[id];
  const aspect = width / height;
  const elongated = id === 'bottle' || Math.max(w / h, h / w) >= 1.5;
  // A modestly wide tube can still be an upright rocket nozzle. Its slot turns
  // the opening downward; only a clearly horizontal tail pipe needs this turn.
  const horizontalThreshold = id === 'tube' ? 1.5 : 1.15;
  const turn = elongated && ((aspect > horizontalThreshold && h > w) || (aspect < .87 && w > h));
  const viewBox = turn ? `${-y - h} ${x} ${h} ${w}` : `${x} ${y} ${w} ${h}`;
  const shapes = OBJECTS[id].svg.replace(/^<svg[^>]*>/, '').replace(/<\/svg>$/, '');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" preserveAspectRatio="none" class="gum-object-svg" focusable="false" aria-hidden="true" data-art-turn="${turn ? 90 : 0}">${turn ? `<g transform="rotate(90)">${shapes}</g>` : shapes}</svg>`;
}

/** A stretched blob, rather than a sticker medallion, previews each connector color. */
export function gumArt(color: GumColor): string {
  const p = GUM_PALETTE[color];
  return svg(`<path d="M16 39c10-14 22-13 30-2 7 10 21 10 29-1 9-12 25-8 30 3 7 15 4 35-8 40-10 5-17-2-24-7-8-6-19-6-28 2-11 12-29 8-33-5-4-10-3-22 4-30Z" fill="${p.fill}" stroke="${p.shade}" stroke-width="3.5"/>
    <path d="M21 43q7-10 16-3m8 12q15 7 29-3m10-5q8-7 13 1" fill="none" stroke="${p.highlight}" stroke-width="5"/>
    <path d="M23 71q8 5 15-1m43-1q9 8 15 1" fill="none" stroke="${p.shade}" stroke-width="2" opacity=".45"/>`);
}

const backdrop = (shapes: string) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 480" preserveAspectRatio="xMidYMid slice" class="gum-world-svg" focusable="false" aria-hidden="true"><g stroke-linecap="round" stroke-linejoin="round">${shapes}</g></svg>`;

const SCENES: Record<SceneWorld, string> = {
  sky: backdrop(`
    <path d="M0 0h800v480H0Z" fill="#d8edfa"/>
    <circle cx="674" cy="82" r="44" fill="#fff0b4"/><circle cx="674" cy="82" r="34" fill="#ffdfa0"/>
    <g fill="#fff" opacity=".84"><path d="M0 102q27-40 61-11 2-46 43-41 34 3 35 39 40-9 53 28H0Z"/><path d="M499 57q15-24 40-14 4-32 34-30 29 1 33 28 31-8 47 23H499Z"/><path d="M642 211q17-35 56-20 0-45 41-41 32 2 37 39 31-4 46 26H642Z"/></g>
    <path d="M0 407q90-47 179-2 76-40 151 5 81-48 163-2 91-46 174 4 71-40 133-3v71H0Z" fill="#c2d4f2"/>
    <path d="M0 444q102-36 204-1 95-37 202 1 103-35 203 2 96-35 191 0v34H0Z" fill="#edf3ff"/>
    <g fill="#a7bddd"><path d="m195 67 5 11 12 2-9 8 2 12-10-6-10 6 2-12-9-8 12-2Z"/><path d="m740 50 4 8 9 2-7 6 1 9-7-5-8 5 2-9-7-6 9-2Z"/></g>
    <path d="M52 235q10-11 21 0 10-11 21 0M696 310q9-9 18 0 9-9 18 0" fill="none" stroke="#859bc9" stroke-width="3"/>
  `),
  sea: backdrop(`
    <path d="M0 0h800v480H0Z" fill="#a5dfea"/>
    <path d="m90 0 67 0 175 480H128Zm243 0h45l132 480H383Zm225 0h37l110 480H592Z" fill="#e5ffed" opacity=".26"/>
    <path d="M0 0q90 19 176 1 94 18 194 0 100 18 205 0 100 18 225 1v27q-110 18-214 0-100 19-205 1-96 18-195 0-95 18-186 0Z" fill="#dbf8f1"/>
    <path d="M0 417q119-42 259 10 149-47 291 1 127-36 250-3v55H0Z" fill="#8fbdcd"/>
    <path d="M0 449q158-32 315 2 152-34 311 0 91-24 174-2v31H0Z" fill="#e9d3ba"/>
    <g fill="none" stroke="#6daea4" stroke-width="11"><path d="M42 457q-20-32-3-51t-9-50M74 459q20-40 3-67t8-43M740 458q-17-39 3-70t-5-39M764 462q24-35 9-68"/></g>
    <path d="M128 458v-53m0 22-20-13m20 28 22-18m-22-7 14-21" stroke="#cc97ac" stroke-width="10" fill="none"/>
    <g fill="#f5ca91" stroke="#bf947f" stroke-width="2"><path d="m670 415 8 12 15 1-10 11 4 14-16-6-13 8 1-16-12-8 15-4Z"/><path d="M210 455q5-25 20-25t21 25Z"/></g>
    <g fill="#f8c39a" stroke="#b4869a" stroke-width="2"><path d="M625 132q24-24 48 0-24 24-48 0l-17 12v-24Z"/><circle cx="663" cy="130" r="2" fill="#536285"/></g>
    <g fill="#b3c6ef" stroke="#849bc4" stroke-width="2"><path d="M84 258q20-19 40 0-20 19-40 0l-13 11v-22Z"/><circle cx="117" cy="256" r="2" fill="#536285"/></g>
    <g fill="none" stroke="#e5ffff" stroke-width="3" opacity=".8"><circle cx="57" cy="139" r="10"/><circle cx="77" cy="103" r="6"/><circle cx="716" cy="249" r="12"/><circle cx="740" cy="217" r="7"/></g>
  `),
  road: backdrop(`
    <path d="M0 0h800v480H0Z" fill="#deedfa"/>
    <circle cx="656" cy="74" r="34" fill="#ffe3a5"/>
    <g fill="#fff" opacity=".85"><path d="M44 88q19-31 42-19 3-29 31-28 27 1 31 27 28-8 43 25H44Z"/><path d="M520 127q18-25 42-13 3-23 27-22 26 1 31 24 21-2 34 21H520Z"/></g>
    <path d="M0 257q140-147 272 1 135-161 273 0 125-137 255-8v230H0Z" fill="#c2c9e8"/>
    <path d="M0 312q135-109 281-1 118-124 254-1 129-97 265-6v176H0Z" fill="#aad3bf"/>
    <path d="M0 377q197-33 401 3 201-35 399-2v102H0Z" fill="#d6e9be"/>
    <path d="M0 405q199-22 401 3 197-22 399-2v48q-200-23-399-2-201-24-401-3Z" fill="#d8c8b8" stroke="#baa99f" stroke-width="3"/>
    <path d="M0 429q200-22 401 3 200-22 399-1" fill="none" stroke="#fff4d5" stroke-width="4" stroke-dasharray="24 25"/>
    <g stroke="#8b967e" stroke-width="5"><path d="M58 377v-57M730 372v-62"/></g>
    <g fill="#87b49c" stroke="#77a68e" stroke-width="2"><circle cx="58" cy="312" r="28"/><circle cx="38" cy="329" r="20"/><circle cx="78" cy="330" r="21"/><circle cx="730" cy="300" r="29"/><circle cx="709" cy="321" r="20"/><circle cx="750" cy="321" r="21"/></g>
    <g fill="#f1b6cc"><circle cx="151" cy="379" r="4"/><circle cx="173" cy="388" r="4"/><circle cx="660" cy="372" r="4"/><circle cx="646" cy="382" r="4"/></g>
  `),
  stage: backdrop(`
    <path d="M0 0h800v480H0Z" fill="#d9d0ee"/>
    <path d="M0 0h85q-9 153-85 270Zm800 0h-85q9 153 85 270Z" fill="#b897d4"/>
    <path d="M0 0h30q6 151-30 226Zm800 0h-30q-6 151 30 226Z" fill="#9978bd"/>
    <path d="M0 0q200 87 400 0 200 87 400 0v26q-200 82-400 0-200 82-400 0Z" fill="#c7a4df"/>
    <path d="M117 0 31 415h242L185 0Zm499 0-78 415h239L683 0Z" fill="#fff1be" opacity=".16"/>
    <path d="M0 416h800v64H0Z" fill="#ddbc9e" stroke="#b89e93" stroke-width="3"/>
    <path d="M0 450h800M133 416v34m134 0v30m133-64v34m133 0v30m134-64v34" stroke="#b89e93" stroke-width="2"/>
    <path d="M77 83q318 70 646 0" fill="none" stroke="#8c799c" stroke-width="3"/>
    <path d="m101 89 18 33 20-26m46 7 18 33 20-27m49 6 18 33 20-29m49 4 18 33 20-32m49-2 18 30 20-33m46-5 20 27 17-32m44-8 23 26 14-34" fill="#f3cb91" stroke="#d0a787" stroke-width="2"/>
    <g fill="#fff0bd"><path d="m94 267 5 14 14 4-14 5-5 14-5-14-14-5 14-4Zm611-66 5 14 14 4-14 5-5 14-5-14-14-5 14-4Z"/><circle cx="161" cy="179" r="4"/><circle cx="647" cy="318" r="4"/></g>
  `),
};

export function sceneDecor(world: SceneWorld): string { return SCENES[world]; }

const moment = (shapes: string, preserve = 'xMidYMid slice') => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 480" preserveAspectRatio="${preserve}" class="gum-moment-svg" focusable="false" aria-hidden="true"><g stroke-linecap="round" stroke-linejoin="round">${shapes}</g></svg>`;
const sparkle = (x: number, y: number, r: number, color = '#fff0b6') =>
  `<path d="M${x} ${y-r}q${r*.2} ${r*.8} ${r} ${r}q-${r*.8} ${r*.2}-${r} ${r}q-${r*.2}-${r*.8}-${r}-${r}q${r*.8}-${r*.2} ${r}-${r}Z" fill="${color}"/>`;
const littleFish = (x: number, y: number, scale: number, color: string, reverse = false) =>
  `<g transform="translate(${x} ${y}) scale(${reverse ? -scale : scale} ${scale})"><g class="gum-moment-float"><path d="M0 0q24-25 51 0Q24 25 0 0L-17 14v-28Z" fill="${color}" stroke="#7583ae" stroke-width="2.5"/><path d="m18-13 10-13 7 12" fill="${color}" stroke="#7583ae" stroke-width="2"/><circle cx="40" cy="-2" r="3" fill="#fff"/><circle cx="41" cy="-2" r="1.5" fill="#485573"/></g></g>`;
const bubble = (x: number, y: number, r: number) => `<circle cx="${x}" cy="${y}" r="${r}" fill="#edffff" fill-opacity=".12" stroke="#f5ffff" stroke-width="3"/><path d="M${x-r*.6} ${y-r*.2}q0-${r*.5} ${r*.5}-${r*.5}" fill="none" stroke="#fff" stroke-width="3"/>`;
const musicNote = (x: number, y: number, scale: number, color: string) =>
  `<g transform="translate(${x} ${y}) scale(${scale})"><g class="gum-moment-float" fill="${color}" stroke="${color}" stroke-width="4"><path d="M0 28V-17l31-8v46" fill="none"/><path d="m0-17 31-8v9L0-8Z"/><ellipse cx="-7" cy="29" rx="10" ry="7" transform="rotate(-18 -7 29)"/><ellipse cx="24" cy="22" rx="10" ry="7" transform="rotate(-18 24 22)"/></g></g>`;

/** The first four story beats retain their identities. The invention stays clear in the
 * middle; motion is optional CSS on child groups, so reduced motion retains art. */
const MOMENTS: Record<SceneWorld, readonly string[]> = {
  sky: [
    moment(`
      <g class="gum-moment-float" fill="#fff" stroke="#bed9ef" stroke-width="2" opacity=".95">
        <path d="M-35 176q21-41 58-20-3-45 39-48 43-3 50 41 35-13 58 27Z"/>
        <path d="M638 315q23-37 56-20 4-38 41-39 40-1 46 38 35-8 50 25H638Z"/>
        <path d="M97 428q16-29 39-16 0-30 30-31 29-1 33 28 24-5 38 22H97Z"/>
      </g>
      <g fill="none" stroke="#fff" stroke-width="5" opacity=".8"><path d="M22 225h90m-65 13h90M672 353h95m-70 12h81"/></g>
      ${sparkle(185, 117, 12)}${sparkle(622, 95, 10)}
    `),
    moment(`
      <g fill="none" stroke-width="14" opacity=".88"><path d="M45 162Q400-131 755 162" stroke="#f6a7bf"/><path d="M57 174Q400-102 743 174" stroke="#f8c38c"/><path d="M69 186Q400-72 731 186" stroke="#f4e3a2"/><path d="M81 198Q400-43 719 198" stroke="#9edac5"/><path d="M93 210Q400-14 707 210" stroke="#a3c8e9"/><path d="M105 222Q400 15 695 222" stroke="#c6afe8"/></g>
      <g class="gum-moment-float" fill="#fff" stroke="#c8d8ec" stroke-width="2"><path d="M0 231q21-31 45-17 0-34 34-35 32 0 37 33 31-6 45 24H0Z"/><path d="M641 231q21-31 45-17 0-34 34-35 32 0 37 33 31-6 45 24H641Z"/></g>
      ${sparkle(186, 350, 16)}${sparkle(650, 371, 20)}${sparkle(721, 301, 9)}
    `),
    moment(`
      <g transform="translate(-110 0)"><g class="gum-moment-float"><circle cx="677" cy="100" r="63" fill="#fff0c1" stroke="#ddc58f" stroke-width="3"/><path d="M694 41a63 63 0 0 1-2 120 58 58 0 0 0 2-120Z" fill="#ecd89e"/><g fill="#ead89f" stroke="#ddc58f" stroke-width="2"><ellipse cx="656" cy="79" rx="13" ry="9"/><circle cx="695" cy="117" r="11"/><ellipse cx="651" cy="129" rx="7" ry="5"/><circle cx="704" cy="72" r="5"/></g></g></g>
      <g class="gum-moment-float">${sparkle(94, 92, 19)}${sparkle(158, 164, 11)}${sparkle(734, 230, 14)}${sparkle(69, 345, 12)}${sparkle(658, 383, 20)}${sparkle(487, 39, 13)}</g>
      <path d="M99 410q20-18 45-13m-31 21q19-18 44-13" fill="none" stroke="#edf5ff" stroke-width="4"/>
    `, 'xMidYMid meet'),
    moment(`
      <g class="gum-moment-float">${sparkle(75, 72, 20)}${sparkle(180, 45, 12)}${sparkle(321, 44, 17)}${sparkle(495, 55, 12)}${sparkle(720, 91, 24)}${sparkle(113, 248, 13)}${sparkle(701, 291, 18)}${sparkle(63, 391, 23)}${sparkle(230, 422, 12)}${sparkle(418, 442, 18)}${sparkle(602, 420, 13)}${sparkle(752, 405, 20)}</g>
      <g fill="none" stroke="#d2c5eb" stroke-width="2" opacity=".8"><path d="m75 72 105-27 141-1m399 47-19 200 51 114M63 391l167 31 188 20 184-22"/></g>
      <g fill="#fff9d8"><circle cx="105" cy="162" r="3"/><circle cx="648" cy="61" r="3"/><circle cx="738" cy="202" r="4"/><circle cx="157" cy="371" r="4"/><circle cx="537" cy="434" r="3"/></g>
    `),
  ],
  sea: [
    moment(`
      <path d="M0 74q45-35 90 0t90 0m440 0q45-35 90 0t90 0" fill="none" stroke="#e7fff7" stroke-width="7"/>
      <g class="gum-moment-float">${bubble(88, 135, 22)}${bubble(139, 195, 13)}${bubble(64, 268, 10)}${bubble(712, 153, 17)}${bubble(739, 288, 25)}${bubble(666, 349, 10)}</g>
      <path d="M18 383q17-22 36 0m676 31q17-22 36 0" fill="none" stroke="#d7fff5" stroke-width="5"/>
      ${littleFish(642, 80, .65, '#f7ca9b')}
    `),
    moment(`
      ${littleFish(53, 109, 1.15, '#f7c38f')}${littleFish(113, 168, .8, '#e8aed0')}${littleFish(25, 229, .7, '#b4c5f1')}
      ${littleFish(738, 133, 1.05, '#d4bcf3', true)}${littleFish(691, 211, .78, '#ffcf94', true)}${littleFish(771, 290, .6, '#f3adc5', true)}
      ${littleFish(84, 365, .7, '#e7c495')}${littleFish(632, 407, .8, '#b6caef')}
      <g class="gum-moment-float">${bubble(157, 71, 7)}${bubble(661, 68, 11)}${bubble(704, 371, 8)}</g>
    `),
    moment(`
      <g fill="none" stroke="#d491ae" stroke-width="11"><path d="M68 450V344m0 42-27-25m27 52 30-25m-30-23 15-26m-42 23-7-20m64 45 12-21M735 452V363m0 34-24-18m24 43 27-25m-27-13 15-24"/></g>
      <g fill="none" stroke="#93bda6" stroke-width="10"><path d="M28 454q-15-45 4-71t-3-43M113 456q-17-41 2-68M770 452q22-38 4-67"/></g>
      <path d="M134 453q0-31 29-30 29-1 30 30Z" fill="#b9a6d6" stroke="#8f85b8" stroke-width="3"/><path d="M147 446v-13m13 14v-19m14 19v-14" stroke="#ded4ed" stroke-width="3"/>
      <g class="gum-moment-float">${littleFish(94, 291, .9, '#f9cf9a')}${littleFish(696, 310, .85, '#e8b9da', true)}${bubble(36, 250, 15)}${bubble(757, 254, 10)}</g>
      ${sparkle(658, 426, 13, '#f8d8a3')}
    `),
    moment(`
      <g class="gum-moment-float">${bubble(58, 87, 25)}${bubble(143, 69, 12)}${bubble(96, 189, 17)}${bubble(40, 309, 21)}${bubble(130, 387, 29)}${bubble(692, 74, 28)}${bubble(755, 171, 15)}${bubble(691, 266, 19)}${bubble(750, 386, 27)}${bubble(617, 434, 11)}${bubble(343, 31, 12)}${bubble(451, 450, 14)}</g>
      ${littleFish(21, 249, 1, '#fac791')}${littleFish(722, 335, 1, '#e8b5d5', true)}
      <g fill="#fff2bc">${sparkle(168, 269, 11)}${sparkle(643, 173, 13)}${sparkle(225, 428, 10)}</g>
    `),
  ],
  road: [
    moment(`
      <g stroke="#ab8b79" stroke-width="4" fill="#f3dcc1"><path d="M35 363v68m27-68v68m27-68v68m-66-52h78m-78 26h78"/></g>
      <path d="M714 362V188" stroke="#7a8da6" stroke-width="6"/><path d="m717 192 61 13-7 29-54-22Z" fill="#efa3b4" stroke="#b37b91" stroke-width="3"/><path d="m738 196-7 21m25-17-7 24" stroke="#fff1d6" stroke-width="9"/>
      <g class="gum-moment-float" fill="none" stroke="#fff6d2" stroke-width="5"><path d="M45 130h58m-36 14h57M676 111h67m-39 15h58"/></g>
      <path d="M165 400v-37m-10 11 10-11 10 11" fill="none" stroke="#97b69b" stroke-width="4"/>
    `),
    moment(`
      <path d="M0 451q77-91 151-36 68-76 136 36" fill="#aed5ae" stroke="#92b99b" stroke-width="3"/>
      <path d="M526 451q89-77 160-26 66-64 114-3v58H526Z" fill="#b7d6b0" stroke="#92b99b" stroke-width="3"/>
      <path d="M0 458q77-65 151-24 68-49 136 24m239 0q89-51 160-17 66-42 114-12" fill="none" stroke="#efe0ba" stroke-width="12"/>
      <g class="gum-moment-float"><path d="M100 89q10-12 20 0 10-12 20 0M676 144q10-12 20 0 10-12 20 0" fill="none" stroke="#879ec3" stroke-width="3"/></g>
      <path d="M81 405v-41m-13 14 13-14 13 14M706 405v-42m-12 15 12-15 12 15" stroke="#91b296" stroke-width="4" fill="none"/>
    `),
    moment(`
      <g stroke="#87ad91" stroke-width="4" fill="none"><path d="M48 440v-54m35 63v-37m56 34v-55M675 445v-51m49 52v-32m44 29v-69"/></g>
      <g fill="#efb1c9" stroke="#c889a9" stroke-width="2"><circle cx="48" cy="381" r="12"/><circle cx="139" cy="385" r="11"/><circle cx="724" cy="408" r="10"/></g>
      <g fill="#f5d899" stroke="#d1af78" stroke-width="2"><circle cx="83" cy="407" r="10"/><circle cx="675" cy="389" r="12"/><circle cx="768" cy="369" r="11"/></g>
      <g fill="#fff1bb"><circle cx="48" cy="381" r="4"/><circle cx="139" cy="385" r="4"/><circle cx="724" cy="408" r="4"/><circle cx="83" cy="407" r="4"/><circle cx="675" cy="389" r="4"/><circle cx="768" cy="369" r="4"/></g>
      <g transform="translate(102 122)"><g class="gum-moment-float"><path d="M0 0c-30-29-36 13-4 14-29 20 11 32 11 2 16 30 47 6 14-4C51-3 24-33 10-4Z" fill="#c7b5e9" stroke="#9685be" stroke-width="2.5"/><path d="m5 0 5 19" stroke="#7e779d" stroke-width="3"/></g></g>
      <g transform="translate(682 191) scale(.75)"><g class="gum-moment-float"><path d="M0 0c-30-29-36 13-4 14-29 20 11 32 11 2 16 30 47 6 14-4C51-3 24-33 10-4Z" fill="#f0b5c8" stroke="#bd839e" stroke-width="2.5"/><path d="m5 0 5 19" stroke="#7e779d" stroke-width="3"/></g></g>
    `),
    moment(`
      <path d="M76 443V113m648 330V113" fill="none" stroke="#7c87ab" stroke-width="6"/>
      <path d="M78 116h68v43H78m648-43h-68v43h68" fill="#fff9e8" stroke="#7c87ab" stroke-width="3"/>
      <path d="M80 118h21v19H80m42-19h21v19h-21m-21 0h21v19h-21m561-38h21v19h-21m42-19h19v19h-19m-21 0h21v19h-21" fill="#a291c7"/>
      <path d="M76 68q324 58 648 0" fill="none" stroke="#a295b4" stroke-width="3"/>
      <path d="m118 77 18 28 17-23m66 9 18 28 17-25m66 5 18 28 17-27m67 0 18 27 17-29m66-4 18 25 17-29m66-8 18 22 17-28" fill="#f4c293" stroke="#cc9b82" stroke-width="2"/>
      <g class="gum-moment-float" fill="none" stroke-width="7"><path d="m36 239 12 9m106-62 9-13m-38 162 15 4" stroke="#e59abf"/><path d="m739 238 10-12m-65 99 14 5m-51-131 13-7" stroke="#a99bda"/><path d="m172 367 5 15m452 20 10-9" stroke="#edc06c"/></g>
      ${sparkle(42, 345, 14)}${sparkle(755, 350, 16)}
    `),
  ],
  stage: [
    moment(`
      <path d="m75 30 44 0 87 390H0Zm607 0h44l74 390H595Z" fill="#fff1b2" opacity=".22"/>
      <g fill="#7f739f" stroke="#625d8b" stroke-width="3"><path d="m61 12 64-2 10 26-79 3Z"/><path d="m675 10 64 2 5 27-79-3Z"/></g>
      <path d="M61 34h70m538 0h70" stroke="#ffedb0" stroke-width="6"/>
      <g class="gum-moment-float">${sparkle(103, 167, 15)}${sparkle(693, 263, 20)}${sparkle(157, 346, 10)}</g>
      <ellipse cx="400" cy="427" rx="230" ry="18" fill="#fff2bd" opacity=".2"/>
    `),
    moment(`
      ${musicNote(83, 173, 1.2, '#b691cf')}${musicNote(679, 242, 1.35, '#df99b8')}${musicNote(137, 345, .9, '#d6b370')}${musicNote(730, 104, .7, '#94b7d0')}
      <g class="gum-moment-float" fill="none" stroke="#c0a8d8" stroke-width="4"><path d="M38 252q-15 18 0 35m14-42q-22 25 0 49M750 333q16 19 0 36m-14-43q23 25 0 50"/></g>
      ${sparkle(180, 80, 10)}${sparkle(621, 379, 14)}
    `),
    moment(`
      <path d="M400 0v22" stroke="#8b7eaa" stroke-width="3"/>
      <circle cx="400" cy="50" r="29" fill="#d9e7f3" stroke="#9394ba" stroke-width="3"/>
      <path d="M372 49h56m-50-14h44m-44 29h44M391 23q-13 28 0 55m18-55q13 28 0 55" stroke="#a8b7d0" stroke-width="2" fill="none"/>
      <path d="m400 77-101 23m105-21 89 27" stroke="#fff0b4" stroke-width="3" opacity=".7"/>
      ${musicNote(74, 219, 1.3, '#d99cbf')}${musicNote(675, 171, 1.25, '#9fb3dd')}${musicNote(704, 359, .85, '#c6abdf')}${musicNote(144, 385, .7, '#e1ba7b')}
      <g class="gum-moment-float">${sparkle(134, 109, 21)}${sparkle(661, 70, 15)}${sparkle(43, 346, 14)}${sparkle(749, 282, 19)}</g>
    `),
    moment(`
      <g class="gum-moment-float" fill="none" stroke-width="8"><path d="m43 91 12 15m81-55 6 18m94-30-8 19m329-14 9 15m86 3-5 16m87 27 14 7m-23 196-13 10M72 293l-6 17" stroke="#e8a1c0"/><path d="m96 196 17-3m-70 186 14-7m145 37-7 17m406-14 9 15m103-36 19 5m-44-201 14 8" stroke="#baa4dc"/><path d="m178 105 6 15m466 6 11 9m-531 242 6-16m512 6-9 17" stroke="#edc66f"/></g>
      <path d="M5 30q42 112 102 122M795 30q-42 112-102 122" fill="none" stroke="#cba9df" stroke-width="12"/>
      <g class="gum-moment-float">${sparkle(96, 249, 24)}${sparkle(702, 268, 26)}${sparkle(258, 53, 13)}${sparkle(534, 62, 13)}${sparkle(226, 432, 15)}${sparkle(579, 433, 17)}</g>
      <path d="M316 438q84 13 168 0" fill="none" stroke="#f3d593" stroke-width="5"/>
    `),
  ],
};

const distantStars = () => `<g fill="#fff4cd" opacity=".85">${[
  [42, 49, 2], [119, 111, 3], [226, 31, 2], [318, 64, 3], [452, 24, 2], [626, 37, 2], [747, 88, 3],
  [68, 234, 3], [160, 310, 2], [37, 421, 2], [217, 432, 3], [330, 459, 2], [492, 437, 3],
  [620, 388, 2], [741, 432, 3], [707, 278, 2], [773, 188, 2], [551, 55, 2],
].map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}"/>`).join('')}</g>`;
const night = (color: string) => `<path d="M0 0h800v480H0Z" fill="${color}"/>${distantStars()}`;
const deepSea = (color: string) => `<path d="M0 0h800v480H0Z" fill="${color}"/>
  <path d="M70 0h45l99 480H79Zm257 0h34l70 480h-99ZM621 0h27l55 480h-76Z" fill="#b3eff3" opacity=".06"/>
  <path d="M0 431q107-33 214 1 109-28 224 4 178-38 362-3v47H0Z" fill="#1e4d70" opacity=".7"/>`;
const confetti = () => `<g class="gum-moment-float" fill="none" stroke-width="7">
  <path d="m80 91 8 15m84-61-6 18m82 2 9 12m337-16 7 15m81 31-12 9m72 120-8 14m-601 49 12 7" stroke="#f2a5c9"/>
  <path d="m119 205 13-6m-78 164 13 7m116 43-5 16m438-20 6 15m102-59 13-7m-3-188 10 8" stroke="#9adbd8"/>
  <path d="m220 105 7 12m372 5 8 12m-458 240 7-13m507 5-9 12" stroke="#f5d282"/></g>`;

/** Further milestones change the whole setting, so a better-working invention
 * visibly travels beyond its earlier outing. Landmarks stay around the craft. */
const FAR_MOMENTS: Record<SceneWorld, readonly string[]> = {
  sky: [
    moment(`
      ${night('#6b659d')}
      <ellipse cx="360" cy="444" rx="470" ry="117" fill="#8c80b2" opacity=".25"/>
      <g transform="translate(560 86) rotate(-18)"><g class="gum-moment-float">
        <ellipse rx="116" ry="31" fill="none" stroke="#cdb7e9" stroke-width="17"/>
        <circle r="56" fill="#e5b6c9" stroke="#b68bb3" stroke-width="3"/>
        <path d="M-49-25q47 16 99 4m-104 19q53 17 108 3m-99 22q41 13 85 5" fill="none" stroke="#f5d3d8" stroke-width="9"/>
        <path d="M-112 8q109 47 222-2" fill="none" stroke="#e2cbed" stroke-width="14"/>
        <path d="M-109 11q109 37 215-1" fill="none" stroke="#b8a5d6" stroke-width="3"/>
      </g></g>
      <circle cx="134" cy="367" r="37" fill="#8ec5d1" stroke="#79a8c5" stroke-width="3"/>
      <path d="M105 354q25-7 57 7m-58 15q27-8 56 6" fill="none" stroke="#b3dfe0" stroke-width="6"/>
      ${sparkle(217, 116, 14)}${sparkle(698, 349, 18)}${sparkle(91, 168, 10)}
    `),
    moment(`
      ${night('#514c87')}
      <path d="M-60 7q241-13 448 74" fill="none" stroke="#989bd3" stroke-width="72" opacity=".16"/>
      <g class="gum-moment-float">
        <path d="M146-22q176 13 365 99-131 11-365-99Z" fill="#a5cce9" opacity=".6"/>
        <path d="M231-6q143 25 281 83-99 3-281-83Z" fill="#d2e6ef"/>
        <path d="M333 28q87 13 182 49-60 7-182-49Z" fill="#fff3c4"/>
        <circle cx="515" cy="78" r="25" fill="#ffeab1" stroke="#f3c883" stroke-width="3"/>
        <circle cx="522" cy="75" r="12" fill="#fff9df"/>
      </g>
      <path d="M75 336q72 13 100 51m465-133q56 6 93 31" fill="none" stroke="#9a95cf" stroke-width="3" opacity=".7"/>
      <circle cx="691" cy="378" r="25" fill="#ae9ad0"/><circle cx="684" cy="372" r="6" fill="#8e7fbb"/><circle cx="704" cy="383" r="4" fill="#8e7fbb"/>
      ${sparkle(134, 192, 16)}${sparkle(654, 140, 13)}${sparkle(200, 425, 11)}${sparkle(594, 424, 16)}
    `),
    moment(`
      ${night('#343967')}
      <g transform="translate(400 91) rotate(-12)">
        <ellipse rx="262" ry="68" fill="#a69ed9" opacity=".10"/>
        <ellipse rx="216" ry="47" fill="#bd9bd6" opacity=".16"/>
        <ellipse rx="135" ry="29" fill="#f3bddb" opacity=".22"/>
        <path d="M-225 4q65-68 210-27T201 12Q115 73-18 29T-214 8" fill="none" stroke="#b9a7e1" stroke-width="11" opacity=".65"/>
        <path d="M-145-2q54-35 137-13T131 6Q63 39-10 15T-139-2" fill="none" stroke="#ecc6e6" stroke-width="8" opacity=".75"/>
        <ellipse rx="41" ry="17" fill="#fff0cf" opacity=".85"/>
      </g>
      <g class="gum-moment-float">${sparkle(115, 204, 22)}${sparkle(682, 222, 18)}${sparkle(89, 371, 15)}${sparkle(704, 409, 23)}${sparkle(304, 425, 13)}${sparkle(534, 435, 15)}</g>
      <path d="M72 360q64 23 107 76m449-35q81-15 127-68" fill="none" stroke="#8889bf" stroke-width="2"/>
      <circle cx="163" cy="274" r="20" fill="#81b4ca"/><path d="M143 272q20 10 39 2" fill="none" stroke="#bee0df" stroke-width="5"/>
    `),
  ],
  sea: [
    moment(`
      ${deepSea('#5babbf')}
      <path d="M135 434V170q0-120 265-120t265 120v264h-46V181q0-88-219-88t-219 88v253Z" fill="#9ebdc2" stroke="#7c9fae" stroke-width="4"/>
      <path d="M145 181h47m416 0h48M150 230h34m432 0h34M150 289h34m432 0h34M150 349h34m432 0h34" stroke="#c0d3d2" stroke-width="7"/>
      <path d="m266 74 10 30m90-51 3 32m96-31-4 32m87-15-11 30" stroke="#7e9ea9" stroke-width="3"/>
      <path d="M104 442q-11-57 9-85m575 84q19-45 5-79" fill="none" stroke="#92d4b9" stroke-width="10"/>
      <g transform="translate(644 411)"><path d="M-41 0v-28q42-40 84 0V0Z" fill="#d3a172" stroke="#987f79" stroke-width="3"/><path d="M-41-23h84M-18-44v44m38-44v44" stroke="#e9c28a" stroke-width="7"/><circle cy="-14" r="6" fill="#f6df9b"/></g>
      <g class="gum-moment-float">${bubble(82, 247, 17)}${bubble(711, 299, 12)}${bubble(215, 52, 8)}</g>
      ${sparkle(621, 369, 14, '#fff0b4')}
    `),
    moment(`
      ${deepSea('#407f9f')}
      <g transform="translate(450 82)"><g class="gum-moment-float">
        <path d="M-137 3q14-49 96-49 71 0 127 34 49 23 83-13-3 29-24 45 31 6 43 32-45-12-67-7-41 35-126 27-108-2-132-69Z" fill="#93b7d6" stroke="#6d92bb" stroke-width="3"/>
        <path d="M-124 24q72 43 171 30-52 40-129 14-28-10-42-44Z" fill="#c5dbe4"/>
        <path d="M-30 43q20 45 57 30L7 43" fill="#759dc4" stroke="#6d92bb" stroke-width="3"/>
        <circle cx="-94" cy="9" r="5" fill="#3b567a"/><path d="M-113 26q16 8 28-1" fill="none" stroke="#5d7fa1" stroke-width="3"/>
        <path d="M-43-47q-20-27-28-10m28 10q18-30 29-13" fill="none" stroke="#d4f1ef" stroke-width="5"/>
      </g></g>
      ${littleFish(89, 323, .9, '#d2badf')}${littleFish(689, 308, 1, '#e5c696', true)}
      <g class="gum-moment-float">${bubble(96, 178, 13)}${bubble(716, 182, 20)}${bubble(678, 412, 13)}${bubble(190, 430, 9)}</g>
      <path d="M0 457q120-40 232-9 159-34 287 1 135-31 281 3v28H0Z" fill="#477b92"/>
    `),
    moment(`
      ${deepSea('#293f70')}
      <g fill="#4f6e9b" opacity=".6"><ellipse cx="85" cy="339" rx="110" ry="140"/><ellipse cx="735" cy="353" rx="120" ry="150"/></g>
      <g transform="translate(153 105)"><g class="gum-moment-float"><path d="M-43 0q4-48 43-48T43 0Z" fill="#9ed7df" fill-opacity=".7" stroke="#c2f2e8" stroke-width="3"/><path d="M-30 1q-15 33 0 58m20-58q-14 46 0 77m20-77q14 46 0 77m20-77q15 33 0 58" fill="none" stroke="#aee6df" stroke-width="4"/><path d="M-25-15q26-19 50 0" fill="none" stroke="#e1fff2" stroke-width="4"/></g></g>
      <g transform="translate(633 103) scale(.78)"><g class="gum-moment-float"><path d="M-45 0q4-48 45-48T45 0Z" fill="#d7b0e2" fill-opacity=".8" stroke="#f0d3ee" stroke-width="3"/><path d="M-30 1q-14 38 0 65m20-65q12 47 0 80m20-80q-12 47 0 80m20-80q14 38 0 65" fill="none" stroke="#d8baed" stroke-width="4"/></g></g>
      <g fill="none" stroke-width="7"><path d="M91 457v-62m0 25-24-17m24 35 21-20m579 39v-72m0 31-23-14m23 34 25-21" stroke="#7fd2c8"/><path d="M143 454q-18-37 1-62m502 64q19-44-3-71" stroke="#bba0df"/></g>
      <g class="gum-moment-float">${sparkle(202, 54, 12, '#bdfff0')}${sparkle(575, 47, 15, '#e9d6ff')}${sparkle(61, 263, 10, '#b9f7ee')}${sparkle(742, 281, 13, '#e8d6ff')}${sparkle(255, 436, 12, '#aef4e8')}${sparkle(530, 435, 10, '#d8c7f6')}</g>
      ${bubble(83, 188, 8)}${bubble(705, 199, 10)}
    `),
  ],
  road: [
    moment(`
      <path d="M0 0h800v480H0Z" fill="#c7e6ef"/><circle cx="644" cy="73" r="38" fill="#ffedb5"/>
      <path d="M0 315 143 130 312 333 491 116 658 319 800 193v287H0Z" fill="#abb4d6"/>
      <path d="m94 194 49-64 64 77-61-23Z m345-16 52-62 58 71-59-21Z" fill="#eef3f5"/>
      <path d="M0 419q220 38 400-4 212-37 400-2v67H0Z" fill="#94cada"/>
      <path d="M-35 454Q400 314 835 454" fill="none" stroke="#c18da9" stroke-width="53"/>
      <path d="M-35 447Q400 307 835 447" fill="none" stroke="#f0b7c7" stroke-width="16"/>
      <path d="M-35 432Q400 292 835 432" fill="none" stroke="#f0d293" stroke-width="15"/>
      <path d="M-35 419Q400 279 835 419" fill="none" stroke="#a5d5bb" stroke-width="12"/>
      <path d="M40 407v-41m48 23v-42m625 43v-42m48 59v-41" stroke="#8c92b8" stroke-width="5"/>
      <path d="M28 366q83-42 147-52m450 0q64 10 147 52" fill="none" stroke="#a4a6c9" stroke-width="4"/>
      <g class="gum-moment-float">${sparkle(136, 85, 14)}${sparkle(700, 195, 12)}</g>
    `),
    moment(`
      <path d="M0 0h800v480H0Z" fill="#d8e6f3"/><circle cx="577" cy="67" r="40" fill="#ffe8b4"/>
      <path d="M0 280q101-158 224-77 134-120 279-3 160-140 297 69v211H0Z" fill="#a9c8bd"/>
      <path d="M0 375q197-48 400-7 215-45 400 2v110H0Z" fill="#bdd8bb"/>
      <g stroke="#a58d9d" stroke-width="3">
        <path d="M72 241v-91h83v91" fill="#e9c9b1"/><path d="m60 151 54-43 53 43Z" fill="#c09dbd"/>
        <path d="M168 212v-97h73v97" fill="#c6b9dd"/><path d="m156 116 48-41 49 41Z" fill="#a58bb8"/>
        <path d="M578 219V115h88v104" fill="#edc9bd"/><path d="m565 117 57-45 56 45Z" fill="#b59fce"/>
        <path d="M682 248v-91h69v91" fill="#c7c9df"/><path d="m671 159 45-36 47 36Z" fill="#9ca3c9"/>
      </g>
      <g fill="#fdf0c8" stroke="#b49aaa" stroke-width="2"><path d="M88 168h19v24H88Zm34 0h19v24h-19Zm62-30h18v23h-18Zm27 0h18v23h-18Zm383 2h21v26h-21Zm34 0h21v26h-21Zm69 38h19v25h-19Z"/></g>
      <path d="M-20 441q204-59 417-9 215-60 423-9" fill="none" stroke="#d7c5b7" stroke-width="43"/>
      <path d="M-20 441q204-59 417-9 215-60 423-9" fill="none" stroke="#fff2cf" stroke-width="4" stroke-dasharray="23 24"/>
      <path d="M55 289q330-88 690 0" fill="none" stroke="#8a9c9b" stroke-width="2"/>
      <path d="m80 283 16 22 14-27m44-9 16 23 14-28m444 2 16 27 14-22m43 11 17 28 14-23" fill="#f4c895"/>
    `),
    moment(`
      <path d="M0 0h800v480H0Z" fill="#bcbfdf"/><circle cx="622" cy="77" r="38" fill="#fff0c6"/>
      <path d="M-30 360 163 68 381 367 553 46 837 374v106H0Z" fill="#8d9fc6"/>
      <path d="m110 148 53-80 70 96-67-24Zm390-2 53-100 83 96-80-22Z" fill="#ebedf5"/>
      <path d="M0 393q219-63 405-15 209-63 395 4v98H0Z" fill="#94b8b1"/>
      <path d="M0 437q220-32 405 0 202-37 395-4" fill="none" stroke="#d7c6bd" stroke-width="49"/>
      <path d="M47 427V172m706 254V172" stroke="#7f719f" stroke-width="7"/>
      <path d="M47 174q353-116 706 0" fill="none" stroke="#9e79b8" stroke-width="17"/>
      <path d="M49 165q351-114 702 0" fill="none" stroke="#d7b5df" stroke-width="8"/>
      <path d="m72 167 15 30 18-39m75-22 16 31 18-38m75-13 16 32 18-35m76-4 16 34 18-33m75 6 16 37 18-32m74 16 16 39 18-31m71 25 14 39 18-29" fill="#f2c794" stroke="#b99497" stroke-width="2"/>
      <g fill="#ffedb2"><circle cx="74" cy="356" r="7"/><circle cx="727" cy="353" r="7"/><circle cx="121" cy="390" r="5"/><circle cx="677" cy="392" r="5"/></g>
      ${confetti()}${sparkle(126, 261, 18)}${sparkle(681, 269, 18)}
    `),
  ],
  stage: [
    moment(`
      <path d="M0 0h800v480H0Z" fill="#68608c"/>
      <path d="M0 0h800v81q-200 44-400 0Q190 125 0 80Z" fill="#b083b1"/>
      <path d="M0 0h104q-11 187-104 309Zm800 0H696q11 187 104 309Z" fill="#ae80ac"/>
      <path d="M0 0h31q8 204-31 258Zm800 0h-31q-8 204 31 258Z" fill="#8c699f"/>
      <path d="M70 70q328 69 660 0" fill="none" stroke="#e2bf8c" stroke-width="8"/>
      <path d="m107 78 16 31 20-24m87 10 17 34 20-29m87 5 17 34 20-33m87-2 17 32 20-36m86-8 18 29 18-35" fill="#f3d1a0"/>
      <path d="m165 81-76 343h220L221 81m358 0-75 343h223L635 81" fill="#fff0bd" opacity=".13"/>
      <path d="M0 423h800v57H0Z" fill="#bb99a0"/><path d="M0 450h800" stroke="#8c798c" stroke-width="3"/>
      <g fill="#8b78a6" stroke="#b59bc5" stroke-width="3"><path d="M18 329h114v42H18Zm650 0h114v42H668Z"/><path d="M25 312q50-32 100 0m550 0q50-32 100 0" fill="none"/></g>
      ${sparkle(169, 181, 18)}${sparkle(640, 201, 18)}${sparkle(137, 383, 12)}
    `),
    moment(`
      <path d="M0 0h800v480H0Z" fill="#aeafd2"/>
      <path d="M0 301h64V142h78v159h47V99h64v202h61V174h64v127h49V130h85v171h55V90h70v211h46V154h83v147h44v179H0Z" fill="#8a8fb9" opacity=".65"/>
      <path d="M0 411q194-31 398 0 205-32 402-1v70H0Z" fill="#c7abc2"/>
      <path d="M0 444q191-30 398 0 205-33 402-1" fill="none" stroke="#ead3d9" stroke-width="9"/>
      <path d="M52 51q347 85 696 0" fill="none" stroke="#7c749f" stroke-width="3"/>
      <g fill="#ffebbb" stroke="#d8ba9f" stroke-width="2"><circle cx="111" cy="64" r="10"/><circle cx="225" cy="84" r="10"/><circle cx="342" cy="94" r="10"/><circle cx="460" cy="93" r="10"/><circle cx="578" cy="81" r="10"/><circle cx="691" cy="63" r="10"/></g>
      ${musicNote(115, 207, 1.6, '#f0cadf')}${musicNote(658, 248, 1.6, '#f1d395')}${musicNote(136, 372, 1, '#a4e0d5')}${musicNote(688, 375, .9, '#d6c4ec')}
      ${confetti()}
    `),
    moment(`
      ${night('#45436f')}
      <path d="M77 430V202q0-147 323-147t323 147v228" fill="none" stroke="#9581b9" stroke-width="25"/>
      <path d="M77 430V202q0-147 323-147t323 147v228" fill="none" stroke="#e8c994" stroke-width="7"/>
      <path d="M0 428h800v52H0Z" fill="#a58bae"/><path d="M0 452h800" stroke="#7b7097" stroke-width="3"/>
      <path d="m139 425 63-334h32l79 334m174 0 80-334h32l62 334" fill="#fff1bb" opacity=".13"/>
      <g class="gum-moment-float">${sparkle(156, 185, 28, '#ffe5aa')}${sparkle(648, 184, 28, '#ffe5aa')}${sparkle(270, 60, 20, '#ffe5aa')}${sparkle(526, 58, 20, '#ffe5aa')}${sparkle(105, 343, 20, '#f1c4df')}${sparkle(697, 344, 20, '#b6e6df')}</g>
      ${confetti()}
      <g fill="#efd4a3"><circle cx="126" cy="433" r="6"/><circle cx="198" cy="433" r="6"/><circle cx="602" cy="433" r="6"/><circle cx="674" cy="433" r="6"/></g>
    `),
  ],
};

export function sceneMoment(world: SceneWorld, stop: number): string {
  const index = Number.isFinite(stop) ? Math.max(0, Math.min(6, Math.floor(stop))) : 0;
  return index < 4 ? MOMENTS[world][index] : FAR_MOMENTS[world][index - 4];
}

const launchSvg = (shapes: string) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 480" preserveAspectRatio="none" class="gum-launch-svg" focusable="false" aria-hidden="true"><g stroke-linecap="round" stroke-linejoin="round">${shapes}</g></svg>`;
const smokePuff = (x: number, y: number, dx: number, dy: number, delay: number, color = '#e8e4ed') =>
  `<g transform="translate(${x} ${y})"><g class="gum-launch-puff" style="--gum-drift-x:${dx}px;--gum-drift-y:${dy}px;animation-delay:${delay}s"><path d="M-38 12q-20-26 7-37 1-28 28-24 24-19 43 5 27-3 32 22 21 17 0 34Z" fill="${color}" stroke="#fff5ea" stroke-opacity=".65" stroke-width="3"/></g></g>`;

/** Effects share the assembly coordinate system and sit behind the machine.
 * Rocket exhaust starts at the actual booster edge. CSS controls the intro and
 * persistent trail without moving the invention or needing SVG filter IDs. */
export function launchArt(world: SceneWorld, blueprintId = ''): string {
  if (world === 'sky' && (!blueprintId || blueprintId === 'rocket-pop')) return launchSvg(`
    <g class="gum-launch-smoke">${smokePuff(367, 482, -86, 38, -.4)}${smokePuff(432, 486, 83, 31, -1.4)}${smokePuff(397, 510, -13, 43, -.9)}</g>
    <g class="gum-build-trail" transform="translate(400 442)"><g class="gum-launch-jet">
      <g class="gum-launch-flame"><path d="M-34-9q-8 39 4 56 1 20 12 43l12-19 12 53Q21 91 26 68l9 15q18-42-2-92Z" fill="#ef997a" stroke="#c77b87" stroke-width="3"/>
        <path d="M-24-8q-2 29 8 47l-2 22L0 94q13-18 16-44l9 9q10-32-4-67Z" fill="#ffd27b"/>
        <path d="M-13-7q-5 25 14 66Q17 23 11-7Z" fill="#fff5bc"/>
        <path d="M-17 10q0 16 7 27" fill="none" stroke="#ffe7a0" stroke-width="4"/>
      </g>
      <g class="gum-launch-embers" fill="#ffd798"><path d="m-35 76-5 16 10-8Zm65 23-1 18 7-10Zm-16 33-4 15 9-8Z"/></g>
    </g></g>
  `);
  if (world === 'sky') return launchSvg(`
    <g class="gum-launch-smoke">${smokePuff(350, 448, -70, 29, -.3, '#e6edf8')}${smokePuff(450, 448, 70, 29, -1.3, '#e6edf8')}</g>
    <g class="gum-build-trail" fill="none" stroke="#f5fbff" stroke-width="7">
      <g class="gum-launch-flow"><path d="M311 409q-65 22-24 55 39 25 13 60m193-115q65 22 24 55-39 25-13 60"/><path d="M352 438q-31 27-11 57m110-57q31 27 11 57" stroke="#c4d8ed" stroke-width="5"/></g>
      <g class="gum-launch-flow gum-launch-flow-late"><path d="M176 225q-46 44-27 95m501-95q46 44 27 95" stroke="#dceef7" stroke-width="5"/></g>
    </g>
  `);
  if (world === 'sea') return launchSvg(blueprintId === 'sponge-sailor' ? `
    <g class="gum-launch-smoke" fill="#bcecf0" stroke="#effff8" stroke-width="4"><path class="gum-launch-splash" d="M192 396q-47-14-52-46 43-5 58 22-8-45 18-59 24 25 13 61 37-25 64-3-21 36-68 36m346-11q47-14 52-46-43-5-58 22 8-45-18-59-24 25-13 61-37-25-64-3 21 36 68 36Z"/></g>
    <g class="gum-build-trail gum-launch-water" fill="none" stroke="#ecfff8" stroke-width="7"><g class="gum-launch-flow"><path d="M179 418q87 34 205 0 116 34 214 0m-373 27q158 29 324 0"/><path d="M159 402q-27-22-48 0m518 0q27-22 48 0" stroke-width="4"/></g></g>
  ` : `
    <g class="gum-launch-smoke">${smokePuff(667, 259, 92, -34, -.4, '#c2f3ed')}${smokePuff(690, 284, 99, 37, -1.2, '#b9e9ee')}</g>
    <g class="gum-build-trail gum-launch-water"><g class="gum-launch-flow" fill="none" stroke="#effff9" stroke-width="4">
      <circle cx="669" cy="259" r="19"/><circle cx="709" cy="235" r="12"/><circle cx="727" cy="284" r="22"/><circle cx="767" cy="252" r="13"/>
      <path d="M669 212q35-18 67-5m-56 106q39 14 75-2" stroke="#c5f5ef"/>
    </g></g>
  `);
  if (world === 'road') return launchSvg(`
    <g class="gum-launch-smoke">${smokePuff(222, 421, -90, -16, -.2, '#e8d5be')}${smokePuff(511, 430, -74, 9, -1.1, '#e8d5be')}${smokePuff(167, 437, -73, -7, -1.7, '#efddc7')}</g>
    <g class="gum-build-trail"><g class="gum-launch-flow" fill="none" stroke="#fff3d9" stroke-width="6"><path d="M194 422q-30-22-52-1m29 21q-36-8-62 7m359-20q-31-14-48 3"/><path d="M115 380H67m64 19H42m402 44h-49" stroke="#dcc4ad" stroke-width="5"/></g></g>
  `);
  return launchSvg(`
    <g class="gum-build-trail">
      <g class="gum-launch-beams"><path d="m169 469 98-425 45 7 42 418Zm277 0 42-418 45-7 98 425Z" fill="#fff0b6" opacity=".23"/><ellipse cx="400" cy="450" rx="244" ry="25" fill="#fff3bf" opacity=".35"/></g>
      <g class="gum-launch-flow" fill="none" stroke-width="7"><path d="M159 275q-43-59-21-105m501 105q43-59 21-105" stroke="#e9afce"/><path d="M126 351q-36-17-53-49m601 49q36-17 53-49" stroke="#b7d8e6"/></g>
    </g>
    <g class="gum-launch-smoke gum-launch-confetti">${confetti()}</g>
  `);
}
