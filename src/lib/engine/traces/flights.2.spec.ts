// the persistent world draws exactly what it did: part 2 of 2 (testing/pin.ts splits a collection so its flights run side by side)
import { pinFlights } from '../testing/pin'
import { traceFlights } from '../testing/scenarios'

pinFlights('the persistent world draws exactly what it did', traceFlights, 1, 2)
