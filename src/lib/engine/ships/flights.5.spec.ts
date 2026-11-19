// fitted ships draw exactly what they did: part 5 of 5 (testing/pin.ts splits a collection so its flights run side by side)
import { pinFlights } from '../testing/pin'
import { shipFlights } from '../testing/scenarios'

pinFlights('fitted ships draw exactly what they did', shipFlights, 4, 5)
