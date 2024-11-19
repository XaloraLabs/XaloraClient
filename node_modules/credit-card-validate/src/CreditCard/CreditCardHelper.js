// @flow

/**
 * Credit card helper brings static method to validate card properties.
 */
class CreditCardHelper {

    /**
     * Validate number by lunh algoritm.
     * https://gist.github.com/2134376 - Phil Green (ShirtlessKirk)
     *
     * @param {string} number - Card number
     * @returns {boolean} Is valid
     */
    static validateLuhn(number: string): boolean {
        const prodArr = [[0, 1, 2, 3, 4, 5, 6, 7, 8, 9], [0, 2, 4, 6, 8, 1, 3, 5, 7, 9]];

        let len = number.length;
        let mul = 0;
        let sum = 0;

        while (len--) {
            sum += prodArr[mul][parseInt(number.charAt(len), 10)];
            mul ^= 1;
        }

        return sum % 10 === 0 && sum > 0;
    }

    /**
     * Check if start of card number match with something in list.
     *
     * @param {string} number - credit card number
     * @param {Array} startDigits - list of possible starts of card number
     * @returns {boolean} match was found
     */
    static isNumberBeginMatch(number: string, startDigits: Array<string>): boolean {
        return startDigits.some((value) => {
            const shortenValue = value.substring(0, number.length);
            return shortenValue === number.substring(0, shortenValue.length);
        });
    }
}

export default CreditCardHelper;
