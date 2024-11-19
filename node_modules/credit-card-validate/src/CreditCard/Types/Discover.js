// @flow
import CreditCard from '../CreditCard';
import type { Location } from '../CreditCardTypes';

/**
 * Discover
 */
class Discover extends CreditCard {

    /** @inheritdoc */
    constructor(number: string, expire: ?Date, code: ?string) {
        super(number, expire, code);
        this.name = 'Discover';
        this.allowedDigits = Discover.getAllowedDigits();
        this.allowedCodeDigits = Discover.getAllowedCodeDigits();
        this.codeLocation = Discover.getCodeLocation();
        this.startDigits = Discover.getStartDigits();
    }

    /**
     * Get list of digits which can be on begining of card.
     *
     * @returns {[string]} list of digits
     */
    static getStartDigits(): Array<string> {
        return ['65', '6011', '644649', '622126622925'];
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
        return [16, 19];
    }
}

export default Discover;
