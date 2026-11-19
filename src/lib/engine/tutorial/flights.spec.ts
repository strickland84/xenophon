// the first session draws exactly what it did: part 1 of 1 (testing/pin.ts splits a collection so its flights run side by side)
import { pinFlights } from '../testing/pin'
import { firstFlights } from '../testing/scenarios'

pinFlights('the first session draws exactly what it did', firstFlights, 0, 1)
