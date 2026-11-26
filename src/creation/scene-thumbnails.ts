import { SceneEngine } from './engine';
import { CreationStage } from './stage';
import { privateArtReferences, type PrivateArtResolver } from './private-art';
import type { CreationProject } from './model';

/** Render visible cards serially so a long gallery never opens a full-size stage
 * for each project at once. Only the small resulting canvases stay on the shelf. */
export function sceneThumbnails(resolver: PrivateArtResolver, current: () => boolean) {
  const projects = new WeakMap<HTMLElement, CreationProject>();
  const stage = new CreationStage(document.createElement('canvas'), resolver);
  let active = true, queue = Promise.resolve();
  const observer = new IntersectionObserver(entries => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      const card = entry.target as HTMLElement, project = projects.get(card);
      observer.unobserve(card);
      if (!project) continue;
      const valid = () => active && current() && card.isConnected;
      queue = queue.then(async () => {
        if (!valid()) return;
        try {
          await Promise.all([stage.prepare(project, valid), ...privateArtReferences(project).map(id => resolver.load(id))]);
          if (!valid()) return;
          stage.render(project, new SceneEngine(project).snapshot());
          const canvas = document.createElement('canvas');
          canvas.width = 192; canvas.height = Math.round(192 * project.height / project.width);
          canvas.getContext('2d')!.drawImage(stage.canvas, 0, 0, canvas.width, canvas.height);
          card.replaceChildren(canvas);
        } catch {
          if (valid()) card.textContent = 'Preview unavailable';
        } finally {
          stage.clear();
        }
      });
    }
  });
  return {
    add(project: CreationProject) {
      const thumb = document.createElement('span'); thumb.className = 'creation-scene-thumbnail';
      thumb.textContent = 'Loading preview…';
      projects.set(thumb, project); observer.observe(thumb);
      return thumb;
    },
    clear() { active = false; observer.disconnect(); stage.clear(); }
  };
}
