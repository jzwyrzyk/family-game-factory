// Focused offline host. The editor, asset shelf, revision writer and embedded
// sketch reader are the same modules used by the ordinary My Art route.
import {installArtStudio} from '../../src/drawing/studio';
import {installRewardWriteGuard} from '../../src/rewards/write-guard';
import '../../src/brand/art-library.css';
import '../../src/brand/icons.css';
import '../../src/drawing/style.css';

const host = window as any;
const profile = {id: 'synthetic-drawing-review', grade: host.__reviewConfig.grade};
host.FG = {store: {current: () => profile}};
function separateActivity() {
  throw Error('Open the full offline review to try this activity.');
}
installArtStudio({
  enter() {
    document.getElementById('page-art-studio')!.classList.remove('hidden');
    return true;
  },
  home: separateActivity,
  openScene: separateActivity,
  openCar: separateActivity
});
void installRewardWriteGuard().then(() => parent.postMessage({type: 'review-ready'}, '*'));
