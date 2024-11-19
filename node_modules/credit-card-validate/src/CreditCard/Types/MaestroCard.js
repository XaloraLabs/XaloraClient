// @flow
import CreditCard from '../CreditCard';
import type { Location } from '../CreditCardTypes';

/**
 * Maestro card
 */
class MaestroCard extends CreditCard {

    /** @inheritdoc */
    constructor(number: string, expire: ?Date, code: ?string) {
        super(number, expire, code);
        this.name = 'Maestro Card';
        this.allowedDigits = MaestroCard.getAllowedDigits();
        this.allowedCodeDigits = MaestroCard.getAllowedCodeDigits();
        this.codeLocation = MaestroCard.getCodeLocation();
        this.startDigits = MaestroCard.getStartDigits();
    }

    /**
     * Get list of digits which can be on begining of card.
     *
     * @returns {[string]} list of digits
     */
    static getStartDigits(): Array<string> {
        return ['50', '56', '57', '58', '59', '61', '62', '63', '64', '65', '66', '67', '68', '69'];
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
        return [12, 13, 14, 15, 16, 17, 18, 19];
    }
}

export default MaestroCard;
