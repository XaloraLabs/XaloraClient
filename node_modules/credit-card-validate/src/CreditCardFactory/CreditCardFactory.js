// @flow
import CreditCardHelper from '../CreditCard/CreditCardHelper';


/**
 * Credit card factory for detecting card types.
 */
class CreditCardFactory {
    cardTypes: Array<any>;

    /**
     * Costructor
     *
     * @param {Array} cardTypes - List of supported credit cards
     */
    constructor(cardTypes: Array<any>) {
        this.cardTypes = cardTypes;
    }

    /**
     * Create credit card base on gives values.
     *
     * @param {string} number - Credit card number
     * @param {Date} expire - Expire date on card
     * @param {string} code - Code of card
     * @returns {Array} List of cards that match
     */
    find(number: string, expire: Date, code: number): Array<any> {
        const creditCards = this.cardTypes.filter((card) => {
            return CreditCardHelper.isNumberBeginMatch(number, card.getStartDigits());
        });

        if (!creditCards.length) {
            return [];
        }

        return creditCards.map((value, key, array) => {
            return new array[key](number, expire, code);
        });
    }

}

export default CreditCardFactory;
