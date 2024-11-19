// @flow
import CreditCard from '../CreditCard';
import type { Location } from '../CreditCardTypes';

/**
 * American Express
 */
class AmericanExpress extends CreditCard {

    /** @inheritdoc */
    constructor(number: string, expire: ?Date, code: ?string) {
        super(number, expire, code);
        this.name = 'American Express';
        this.allowedDigits = AmericanExpress.getAllowedDigits();
        this.allowedCodeDigits = AmericanExpress.getAllowedCodeDigits();
        this.codeLocation = AmericanExpress.getCodeLocation();
        this.startDigits = AmericanExpress.getStartDigits();
    }

    /**
     * Get list of digits which can be on begining of card.
     *
     * @returns {[string]} list of digits
     */
    static getStartDigits(): Array<string> {
        return ['34', '37'];
    }

    /**
     * Where is code located?
     *
     * @returns {Location} code location
     */
    static getCodeLocation(): Location {
        return 'front';
    }

    /**
     * How many digits have code?
     *
     * @returns {number} number of digits
     */
    static getAllowedCodeDigits(): number {
        return 4;
    }

    /**
     * Get kist of number of digits that can have credit card number.
     *
     * @returns {[number]} list of number of digits
     */
    static getAllowedDigits(): Array<number> {
        return [15];
    }
}

export default AmericanExpress;
