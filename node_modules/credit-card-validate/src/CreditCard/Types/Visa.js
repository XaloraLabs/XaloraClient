// @flow
import CreditCard from '../CreditCard';
import type { Location } from '../CreditCardTypes';

/**
 * Visa credit card.
 */
class Visa extends CreditCard {

    /** @inheritdoc */
    constructor(number: string, expire: ?Date, code: ?string) {
        super(number, expire, code);
        this.name = 'Visa';
        this.allowedDigits = Visa.getAllowedDigits();
        this.allowedCodeDigits = Visa.getAllowedCodeDigits();
        this.codeLocation = Visa.getCodeLocation();
        this.startDigits = Visa.getStartDigits();
    }

    /**
     * Get list of digits which can be on begining of card.
     *
     * @returns {[string]} list of digits
     */
    static getStartDigits(): Array<string> {
        return ['4'];
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
        return [13, 16, 19];
    }
}

export default Visa;
