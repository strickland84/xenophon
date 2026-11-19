// the worlds draw exactly what they did: part 4 of 8 (testing/pin.ts splits a collection so its flights run side by side)
import { pinFlights } from '../testing/pin'
import { worldFlights } from '../testing/scenarios'

pinFlights('the worlds draw exactly what they did', worldFlights, 3, 8)
