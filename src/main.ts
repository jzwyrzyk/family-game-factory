import './legacy/store.js';
import './learning/bootstrap';
import './legacy/bridge.js';
import './runtime/registry';
import './legacy/ui.js';
import { initLiveRemix } from './factory/ui';
initLiveRemix();

import { initBuilder } from './builder/ui';
void initBuilder();

import {installJemsDelight} from './brand/delight';
import './brand/delight.css';
import './brand/journey.css';
installJemsDelight();

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
