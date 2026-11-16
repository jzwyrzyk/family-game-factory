import './legacy/store.js';
import './legacy/math.js';
import './legacy/bridge.js';
import './runtime/registry';
import './legacy/ui.js';
import { initLiveRemix } from './factory/ui';
initLiveRemix();

import { initBuilder } from './builder/ui';
void initBuilder();

import {installOffline} from './offline';
installOffline();

import {installDrawings} from './assets/ui';
installDrawings();

import {installQualityCards} from './quality/cards';
installQualityCards();

// Opt-in review: same runtime and backend, one persistent creative workspace.
import {installStudio} from "./studio/ui";
import {installStudioHostNavigation} from "./studio/host-navigation";
void installStudio().then(installStudioHostNavigation);
