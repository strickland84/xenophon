// the worlds’ creatures draw exactly what they did: part 1 of 1 (testing/pin.ts splits a collection so its flights run side by side)
import { pinFlights } from '../testing/pin'
import { creatureFlights } from '../testing/scenarios'

pinFlights('the worlds’ creatures draw exactly what they did', creatureFlights, 0, 1)
