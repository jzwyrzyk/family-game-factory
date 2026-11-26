// Fixed generated-module-v2 example for local review. The host chooses the pixels.
export function createGame() {
  const gems = [4, 1, 6];
  const x = tile => 90 + 90 * tile;
  return {
    init: () => ({ tile: 0, score: 0 }),
    step(state, input) {
      const direction = input.pressed.includes('right') ? 1 : input.pressed.includes('left') ? -1 : 0;
      const tile = Math.max(0, Math.min(6, state.tile + direction));
      return { tile, score: state.score + Number(tile === gems[state.score]) };
    },
    draw(state) {
      const commands = [{ type: 'image', key: 'walker', assetId: 'walker', x: x(state.tile), y: 285, width: 100, height: 100 }];
      if (state.score < gems.length) commands.push({ type: 'image', key: 'prize', assetId: 'prize', x: x(gems[state.score]), y: 285, width: 56, height: 56 });
      return commands;
    },
    outcome: state => ({ status: state.score === gems.length ? 'won' : 'playing', score: state.score })
  };
}
