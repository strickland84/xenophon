// the galaxy’s own ships draw exactly what they did: part 1 of 2 (testing/pin.ts splits a collection so its flights run side by side)
import { pinFlights } from '../testing/pin'
import { localFlights } from '../testing/scenarios'

pinFlights('the galaxy’s own ships draw exactly what they did', localFlights, 0, 2)
