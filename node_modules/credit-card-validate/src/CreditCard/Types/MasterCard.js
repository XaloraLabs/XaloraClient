// @flow
import CreditCard from '../CreditCard';
import type { Location } from '../CreditCardTypes';

/**
 * Master card.
 */
class MasterCard extends CreditCard {

    /** @inheritdoc */
    constructor(number: string, expire: ?Date, code: ?string) {
        super(number, expire, code);
        this.name = 'Master Card';
        this.allowedDigits = MasterCard.getAllowedDigits();
        this.allowedCodeDigits = MasterCard.getAllowedCodeDigits();
        this.codeLocation = MasterCard.getCodeLocation();
        this.startDigits = MasterCard.getStartDigits();
    }

    /**
     * Get list of digits which can be on begining of card.
     *
     * @returns {[string]} list of digits
     */
    static getStartDigits(): Array<string> {
        return ['51', '52', '53', '54', '55', '23', '24', '25', '26', '27', '222', '223', '224', '225', '226', '227', '228', '229'];
    }

    /**
     * Where is code located?
     *
     * @returns {Location} code location
     */
    static getCodeLocation(): Location {
        return 'back';
    }

    /**
     * How many digits have code?
     *
     * @returns {number} number of digits
     */
    static getAllowedCodeDigits(): number {
        return 3;
    }

    /**
     * Get kist of number of digits that can have credit card number.
     *
     * @returns {[number]} list of number of digits
     */
    static getAllowedDigits(): Array<number> {
        return [16];
    }
}

export default MasterCard;
