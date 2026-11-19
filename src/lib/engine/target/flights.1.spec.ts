// the target key draws exactly what it did: part 1 of 3 (testing/pin.ts splits a collection so its flights run side by side)
import { pinFlights } from '../testing/pin'
import { targetFlights } from '../testing/scenarios'

pinFlights('the target key draws exactly what it did', targetFlights, 0, 3)
