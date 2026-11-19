// up out of the seat in flight draws exactly what it did: part 1 of 1 (testing/pin.ts splits a collection so its flights run side by side)
import { pinFlights } from '../testing/pin'
import { seatFlights } from '../testing/scenarios'

pinFlights('up out of the seat in flight draws exactly what it did', seatFlights, 0, 1)
