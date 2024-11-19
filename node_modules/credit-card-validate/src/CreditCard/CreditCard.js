// @flow

import CreditCardHelper from './CreditCardHelper';
import MissingDataError from './MissingDataError';
import type { Location } from './CreditCardTypes';

/**
 * General credit card class.
 */
class CreditCard {
    number: string;
    expire: Date;
    code: string;
    name: string;
    startDigits: Array<string>;
    codeLocation: Location;
    allowedCodeDigits: number;
    allowedDigits: Array<number>;

    /**
     * Create new credit card. Only credit number is required.
     *
     * @param {string} number - Credit card number
     * @param {Date} expire - Expire date of card.
     * @param {string} code - CVV, CVC, VCV, ... code on card
     */
    constructor(number: string, expire: ?Date, code: ?string) {
        this.setNumber(number);

        if (expire) {
            this.setExpire(expire);
        }

        if (code) {
            this.setCode(code);
        }
    }

    /**
     * Get card name.
     *
     * @returns {string} card name
     */
    getName(): string {
        return this.name;
    }

    /**
     * Get card number.
     *
     * @returns {string} card number
     */
    getNumber(): string {
        return this.number;
    }

    /**
     * Set card number.
     *
     * @param {string} number - number to set
     * @returns {CreditCard} self
     */
    setNumber(number: string): self {
        this.number = number;
        return this;
    }

    /**
     * Get expire date.
     *
     * @returns {Date} expire date
     */
    getExpire(): Date {
        return this.expire;
    }

    /**
     * Set expire date.
     *
     * @param {Date} expire - expire date to set
     * @returns {CreditCard} self
     */
    setExpire(expire: Date): self {
        this.expire = CreditCard.getCleanedDate(expire);
        return this;
    }

    /**
     * Get card code.
     *
     * @returns {string} card code
     */
    getCode(): string {
        return this.code;
    }

    /**
     * Set card code.
     *
     * @param {string} code - code to set
     * @returns {string} self
     */
    setCode(code: string): self {
        this.code = code;
        return this.code;
    }

    /**
     * Get credit card code location.
     *
     * @returns {string} location - back or front
     */
    getCodeLocation(): string {
        return this.codeLocation;
    }

    /**
     * Get cleaned date with only month and year.
     *
     * @param {Date} date - Date to clean
     * @returns {Date} Cleaned date
     */
    static getCleanedDate(date: Date): Date {
        return new Date(date.getFullYear(), date.getMonth());
    }

    /**
     * Is card expired?
     *
     * @returns {boolean} is expired
     * @throws MissingDataError When date information is not set to card.
     */
    isExpired(): boolean {
        if (!this.getExpire()) {
            throw new MissingDataError('Expire date information is missing.');
        }

        return CreditCard.getCleanedDate(new Date()) > this.getExpire();
    }

    /**
     * Is card number valid based on luhn alogirtm.
     *
     * @returns {boolean} is valid
     */
    isLuhnValid(): boolean {
        return CreditCardHelper.validateLuhn(this.getNumber());
    }

    /**
     * Does credit card match with current type.
     *
     * @returns {boolean} match
     */
    isCardTypeValid(): boolean {
        return CreditCardHelper.isNumberBeginMatch(this.getNumber(), this.startDigits);
    }

    /**
     * Does have valid number of digits?
     *
     * @returns {boolean} have valid number of digits
     */
    isNumberOfDigitsValid(): boolean {
        return this.allowedDigits.some((digits) => {
            return digits === this.getNumber().length;
        });
    }

    /**
     * Does have code of card valid number of digits?
     *
     * @returns {boolean} have code valid number of digits
     * @throws MissingDataError When code information is not set to card.
     */
    isNumberOfCodeDigitsValid(): boolean {
        if (!this.getCode()) {
            throw new MissingDataError('Card card code information is missing.');
        }
        return this.allowedCodeDigits === this.getCode().length;
    }

    /**
     * Is Credit Card valid?
     *
     * @returns {boolean} is valid
     */
    isValid(): boolean {
        return this.isLuhnValid() &&
            this.isNumberOfDigitsValid() &&
            this.isNumberOfCodeDigitsValid() &&
            this.isCardTypeValid() &&
            !this.isExpired();
    }
}

export default CreditCard;
