// the scene draws exactly what it did: part 2 of 7 (testing/pin.ts splits a collection so its flights run side by side)
import { pinFlights } from './testing/pin'
import { scenarios } from './testing/scenarios'

pinFlights('the scene draws exactly what it did', scenarios, 1, 7)
