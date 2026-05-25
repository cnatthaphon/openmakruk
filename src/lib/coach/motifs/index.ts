// Side-effect index — importing this file registers every motif in
// the catalog. Add a new motif: drop a new file in this directory and
// add one line below.
//
// Order of import affects insertion order in the registry's Map, but
// the orchestrator sorts by priority, so import order doesn't change
// behaviour. We keep it alphabetical for review-friendliness.

import './capture';
import './check';
import './develop';
import './fork';
import './hangingTarget';
import './mate';
import './promotion';
