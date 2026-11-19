// space draws exactly what it did: part 2 of 7 (testing/pin.ts splits a collection so its flights run side by side)
import { pinFlights } from '../testing/pin'
import { spaceFlights } from '../testing/scenarios'

pinFlights('space draws exactly what it did', spaceFlights, 1, 7)
