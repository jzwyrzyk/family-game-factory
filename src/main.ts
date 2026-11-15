import './legacy/store.js';
import './legacy/math.js';
import './legacy/bridge.js';
import './runtime/registry';
import './legacy/ui.js';
import { initLiveRemix } from './factory/ui';
initLiveRemix();

import { initBuilder } from './builder/ui';
void initBuilder();

import {installDrawings} from './assets/ui';
installDrawings();

import {installOffline} from './offline';
installOffline();
