// @flow
import CreditCard from '../CreditCard';
import type { Location } from '../CreditCardTypes';

/**
 * JCB card
 */
class JCB extends CreditCard {

    /** @inheritdoc */
    constructor(number: string, expire: ?Date, code: ?string) {
        super(number, expire, code);
        this.name = 'JCB';
        this.allowedDigits = JCB.getAllowedDigits();
        this.allowedCodeDigits = JCB.getAllowedCodeDigits();
        this.codeLocation = JCB.getCodeLocation();
        this.startDigits = JCB.getStartDigits();
    }

    /**
     * Get list of digits which can be on begining of card.
     *
     * @returns {[string]} list of digits
     */
    static getStartDigits(): Array<string> {
        return ['35'];
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
     * https://www.cybersource.com/developers/getting_started/test_and_manage/best_practices/card_type_id/
     *
     * @returns {[number]} list of number of digits
     */
    static getAllowedDigits(): Array<number> {
        return [16, 17, 18, 19];
    }
}

export default JCB;
