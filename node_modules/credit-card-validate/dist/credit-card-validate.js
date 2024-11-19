(function (global, factory) {
  typeof exports === 'object' && typeof module !== 'undefined' ? factory(exports) :
  typeof define === 'function' && define.amd ? define(['exports'], factory) :
  (factory((global.CardValidate = global.CardValidate || {})));
}(this, (function (exports) { 'use strict';

var classCallCheck = function (instance, Constructor) {
  if (!(instance instanceof Constructor)) {
    throw new TypeError("Cannot call a class as a function");
  }
};

var createClass = function () {
  function defineProperties(target, props) {
    for (var i = 0; i < props.length; i++) {
      var descriptor = props[i];
      descriptor.enumerable = descriptor.enumerable || false;
      descriptor.configurable = true;
      if ("value" in descriptor) descriptor.writable = true;
      Object.defineProperty(target, descriptor.key, descriptor);
    }
  }

  return function (Constructor, protoProps, staticProps) {
    if (protoProps) defineProperties(Constructor.prototype, protoProps);
    if (staticProps) defineProperties(Constructor, staticProps);
    return Constructor;
  };
}();







var get = function get(object, property, receiver) {
  if (object === null) object = Function.prototype;
  var desc = Object.getOwnPropertyDescriptor(object, property);

  if (desc === undefined) {
    var parent = Object.getPrototypeOf(object);

    if (parent === null) {
      return undefined;
    } else {
      return get(parent, property, receiver);
    }
  } else if ("value" in desc) {
    return desc.value;
  } else {
    var getter = desc.get;

    if (getter === undefined) {
      return undefined;
    }

    return getter.call(receiver);
  }
};

var inherits = function (subClass, superClass) {
  if (typeof superClass !== "function" && superClass !== null) {
    throw new TypeError("Super expression must either be null or a function, not " + typeof superClass);
  }

  subClass.prototype = Object.create(superClass && superClass.prototype, {
    constructor: {
      value: subClass,
      enumerable: false,
      writable: true,
      configurable: true
    }
  });
  if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass;
};











var possibleConstructorReturn = function (self, call) {
  if (!self) {
    throw new ReferenceError("this hasn't been initialised - super() hasn't been called");
  }

  return call && (typeof call === "object" || typeof call === "function") ? call : self;
};



var set = function set(object, property, value, receiver) {
  var desc = Object.getOwnPropertyDescriptor(object, property);

  if (desc === undefined) {
    var parent = Object.getPrototypeOf(object);

    if (parent !== null) {
      set(parent, property, value, receiver);
    }
  } else if ("value" in desc && desc.writable) {
    desc.value = value;
  } else {
    var setter = desc.set;

    if (setter !== undefined) {
      setter.call(receiver, value);
    }
  }

  return value;
};

/**
 * Credit card helper brings static method to validate card properties.
 */
var CreditCardHelper = function () {
    function CreditCardHelper() {
        classCallCheck(this, CreditCardHelper);
    }

    createClass(CreditCardHelper, null, [{
        key: "validateLuhn",


        /**
         * Validate number by lunh algoritm.
         * https://gist.github.com/2134376 - Phil Green (ShirtlessKirk)
         *
         * @param {string} number - Card number
         * @returns {boolean} Is valid
         */
        value: function validateLuhn(number) {
            var prodArr = [[0, 1, 2, 3, 4, 5, 6, 7, 8, 9], [0, 2, 4, 6, 8, 1, 3, 5, 7, 9]];

            var len = number.length;
            var mul = 0;
            var sum = 0;

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

    }, {
        key: "isNumberBeginMatch",
        value: function isNumberBeginMatch(number, startDigits) {
            return startDigits.some(function (value) {
                var shortenValue = value.substring(0, number.length);
                return shortenValue === number.substring(0, shortenValue.length);
            });
        }
    }]);
    return CreditCardHelper;
}();

/**
 * Credit card factory for detecting card types.
 */

var CreditCardFactory = function () {

    /**
     * Costructor
     *
     * @param {Array} cardTypes - List of supported credit cards
     */
    function CreditCardFactory(cardTypes) {
        classCallCheck(this, CreditCardFactory);

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


    createClass(CreditCardFactory, [{
        key: 'find',
        value: function find(number, expire, code) {
            var creditCards = this.cardTypes.filter(function (card) {
                return CreditCardHelper.isNumberBeginMatch(number, card.getStartDigits());
            });

            if (!creditCards.length) {
                return [];
            }

            return creditCards.map(function (value, key, array) {
                return new array[key](number, expire, code);
            });
        }
    }]);
    return CreditCardFactory;
}();

/**
 * Exception for missing data.
 */
var MissingDataError = function (_Error) {
    inherits(MissingDataError, _Error);

    /**
     * Constructor
     *
     * @param {string} message - Error message
     */
    function MissingDataError(message) {
        classCallCheck(this, MissingDataError);

        var _this = possibleConstructorReturn(this, (MissingDataError.__proto__ || Object.getPrototypeOf(MissingDataError)).call(this, message));

        _this.message = message;
        _this.name = 'MissingDataError';
        return _this;
    }

    return MissingDataError;
}(Error);

/**
 * General credit card class.
 */
var CreditCard = function () {

    /**
     * Create new credit card. Only credit number is required.
     *
     * @param {string} number - Credit card number
     * @param {Date} expire - Expire date of card.
     * @param {string} code - CVV, CVC, VCV, ... code on card
     */
    function CreditCard(number, expire, code) {
        classCallCheck(this, CreditCard);

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


    createClass(CreditCard, [{
        key: 'getName',
        value: function getName() {
            return this.name;
        }

        /**
         * Get card number.
         *
         * @returns {string} card number
         */

    }, {
        key: 'getNumber',
        value: function getNumber() {
            return this.number;
        }

        /**
         * Set card number.
         *
         * @param {string} number - number to set
         * @returns {CreditCard} self
         */

    }, {
        key: 'setNumber',
        value: function setNumber(number) {
            this.number = number;
            return this;
        }

        /**
         * Get expire date.
         *
         * @returns {Date} expire date
         */

    }, {
        key: 'getExpire',
        value: function getExpire() {
            return this.expire;
        }

        /**
         * Set expire date.
         *
         * @param {Date} expire - expire date to set
         * @returns {CreditCard} self
         */

    }, {
        key: 'setExpire',
        value: function setExpire(expire) {
            this.expire = CreditCard.getCleanedDate(expire);
            return this;
        }

        /**
         * Get card code.
         *
         * @returns {string} card code
         */

    }, {
        key: 'getCode',
        value: function getCode() {
            return this.code;
        }

        /**
         * Set card code.
         *
         * @param {string} code - code to set
         * @returns {string} self
         */

    }, {
        key: 'setCode',
        value: function setCode(code) {
            this.code = code;
            return this.code;
        }

        /**
         * Get credit card code location.
         *
         * @returns {string} location - back or front
         */

    }, {
        key: 'getCodeLocation',
        value: function getCodeLocation() {
            return this.codeLocation;
        }

        /**
         * Get cleaned date with only month and year.
         *
         * @param {Date} date - Date to clean
         * @returns {Date} Cleaned date
         */

    }, {
        key: 'isExpired',


        /**
         * Is card expired?
         *
         * @returns {boolean} is expired
         * @throws MissingDataError When date information is not set to card.
         */
        value: function isExpired() {
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

    }, {
        key: 'isLuhnValid',
        value: function isLuhnValid() {
            return CreditCardHelper.validateLuhn(this.getNumber());
        }

        /**
         * Does credit card match with current type.
         *
         * @returns {boolean} match
         */

    }, {
        key: 'isCardTypeValid',
        value: function isCardTypeValid() {
            return CreditCardHelper.isNumberBeginMatch(this.getNumber(), this.startDigits);
        }

        /**
         * Does have valid number of digits?
         *
         * @returns {boolean} have valid number of digits
         */

    }, {
        key: 'isNumberOfDigitsValid',
        value: function isNumberOfDigitsValid() {
            var _this = this;

            return this.allowedDigits.some(function (digits) {
                return digits === _this.getNumber().length;
            });
        }

        /**
         * Does have code of card valid number of digits?
         *
         * @returns {boolean} have code valid number of digits
         * @throws MissingDataError When code information is not set to card.
         */

    }, {
        key: 'isNumberOfCodeDigitsValid',
        value: function isNumberOfCodeDigitsValid() {
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

    }, {
        key: 'isValid',
        value: function isValid() {
            return this.isLuhnValid() && this.isNumberOfDigitsValid() && this.isNumberOfCodeDigitsValid() && this.isCardTypeValid() && !this.isExpired();
        }
    }], [{
        key: 'getCleanedDate',
        value: function getCleanedDate(date) {
            return new Date(date.getFullYear(), date.getMonth());
        }
    }]);
    return CreditCard;
}();

/**
 * Master card.
 */
var MasterCard = function (_CreditCard) {
    inherits(MasterCard, _CreditCard);

    /** @inheritdoc */
    function MasterCard(number, expire, code) {
        classCallCheck(this, MasterCard);

        var _this = possibleConstructorReturn(this, (MasterCard.__proto__ || Object.getPrototypeOf(MasterCard)).call(this, number, expire, code));

        _this.name = 'Master Card';
        _this.allowedDigits = MasterCard.getAllowedDigits();
        _this.allowedCodeDigits = MasterCard.getAllowedCodeDigits();
        _this.codeLocation = MasterCard.getCodeLocation();
        _this.startDigits = MasterCard.getStartDigits();
        return _this;
    }

    /**
     * Get list of digits which can be on begining of card.
     *
     * @returns {[string]} list of digits
     */


    createClass(MasterCard, null, [{
        key: 'getStartDigits',
        value: function getStartDigits() {
            return ['51', '52', '53', '54', '55', '23', '24', '25', '26', '27', '222', '223', '224', '225', '226', '227', '228', '229'];
        }

        /**
         * Where is code located?
         *
         * @returns {Location} code location
         */

    }, {
        key: 'getCodeLocation',
        value: function getCodeLocation() {
            return 'back';
        }

        /**
         * How many digits have code?
         *
         * @returns {number} number of digits
         */

    }, {
        key: 'getAllowedCodeDigits',
        value: function getAllowedCodeDigits() {
            return 3;
        }

        /**
         * Get kist of number of digits that can have credit card number.
         *
         * @returns {[number]} list of number of digits
         */

    }, {
        key: 'getAllowedDigits',
        value: function getAllowedDigits() {
            return [16];
        }
    }]);
    return MasterCard;
}(CreditCard);

/**
 * Visa credit card.
 */
var Visa = function (_CreditCard) {
    inherits(Visa, _CreditCard);

    /** @inheritdoc */
    function Visa(number, expire, code) {
        classCallCheck(this, Visa);

        var _this = possibleConstructorReturn(this, (Visa.__proto__ || Object.getPrototypeOf(Visa)).call(this, number, expire, code));

        _this.name = 'Visa';
        _this.allowedDigits = Visa.getAllowedDigits();
        _this.allowedCodeDigits = Visa.getAllowedCodeDigits();
        _this.codeLocation = Visa.getCodeLocation();
        _this.startDigits = Visa.getStartDigits();
        return _this;
    }

    /**
     * Get list of digits which can be on begining of card.
     *
     * @returns {[string]} list of digits
     */


    createClass(Visa, null, [{
        key: 'getStartDigits',
        value: function getStartDigits() {
            return ['4'];
        }

        /**
         * Where is code located?
         *
         * @returns {Location} code location
         */

    }, {
        key: 'getCodeLocation',
        value: function getCodeLocation() {
            return 'back';
        }

        /**
         * How many digits have code?
         *
         * @returns {number} number of digits
         */

    }, {
        key: 'getAllowedCodeDigits',
        value: function getAllowedCodeDigits() {
            return 3;
        }

        /**
         * Get kist of number of digits that can have credit card number.
         *
         * @returns {[number]} list of number of digits
         */

    }, {
        key: 'getAllowedDigits',
        value: function getAllowedDigits() {
            return [13, 16, 19];
        }
    }]);
    return Visa;
}(CreditCard);

/**
 * American Express
 */
var AmericanExpress = function (_CreditCard) {
    inherits(AmericanExpress, _CreditCard);

    /** @inheritdoc */
    function AmericanExpress(number, expire, code) {
        classCallCheck(this, AmericanExpress);

        var _this = possibleConstructorReturn(this, (AmericanExpress.__proto__ || Object.getPrototypeOf(AmericanExpress)).call(this, number, expire, code));

        _this.name = 'American Express';
        _this.allowedDigits = AmericanExpress.getAllowedDigits();
        _this.allowedCodeDigits = AmericanExpress.getAllowedCodeDigits();
        _this.codeLocation = AmericanExpress.getCodeLocation();
        _this.startDigits = AmericanExpress.getStartDigits();
        return _this;
    }

    /**
     * Get list of digits which can be on begining of card.
     *
     * @returns {[string]} list of digits
     */


    createClass(AmericanExpress, null, [{
        key: 'getStartDigits',
        value: function getStartDigits() {
            return ['34', '37'];
        }

        /**
         * Where is code located?
         *
         * @returns {Location} code location
         */

    }, {
        key: 'getCodeLocation',
        value: function getCodeLocation() {
            return 'front';
        }

        /**
         * How many digits have code?
         *
         * @returns {number} number of digits
         */

    }, {
        key: 'getAllowedCodeDigits',
        value: function getAllowedCodeDigits() {
            return 4;
        }

        /**
         * Get kist of number of digits that can have credit card number.
         *
         * @returns {[number]} list of number of digits
         */

    }, {
        key: 'getAllowedDigits',
        value: function getAllowedDigits() {
            return [15];
        }
    }]);
    return AmericanExpress;
}(CreditCard);

/**
 * DinersClub
 */
var DinersClub = function (_CreditCard) {
    inherits(DinersClub, _CreditCard);

    /** @inheritdoc */
    function DinersClub(number, expire, code) {
        classCallCheck(this, DinersClub);

        var _this = possibleConstructorReturn(this, (DinersClub.__proto__ || Object.getPrototypeOf(DinersClub)).call(this, number, expire, code));

        _this.name = 'Diners Club';
        _this.allowedDigits = DinersClub.getAllowedDigits();
        _this.allowedCodeDigits = DinersClub.getAllowedCodeDigits();
        _this.codeLocation = DinersClub.getCodeLocation();
        _this.startDigits = DinersClub.getStartDigits();
        return _this;
    }

    /**
     * Get list of digits which can be on begining of card.
     *
     * @returns {[string]} list of digits
     */


    createClass(DinersClub, null, [{
        key: 'getStartDigits',
        value: function getStartDigits() {
            return ['300', '301', '302', '303', '304', '305', '309', '36', '38', '39'];
        }

        /**
         * Where is code located?
         *
         * @returns {Location} code location
         */

    }, {
        key: 'getCodeLocation',
        value: function getCodeLocation() {
            return 'back';
        }

        /**
         * How many digits have code?
         *
         * @returns {number} number of digits
         */

    }, {
        key: 'getAllowedCodeDigits',
        value: function getAllowedCodeDigits() {
            return 3;
        }

        /**
         * Get kist of number of digits that can have credit card number.
         *
         * @returns {[number]} list of number of digits
         */

    }, {
        key: 'getAllowedDigits',
        value: function getAllowedDigits() {
            return [14];
        }
    }]);
    return DinersClub;
}(CreditCard);

/**
 * Discover
 */
var Discover = function (_CreditCard) {
    inherits(Discover, _CreditCard);

    /** @inheritdoc */
    function Discover(number, expire, code) {
        classCallCheck(this, Discover);

        var _this = possibleConstructorReturn(this, (Discover.__proto__ || Object.getPrototypeOf(Discover)).call(this, number, expire, code));

        _this.name = 'Discover';
        _this.allowedDigits = Discover.getAllowedDigits();
        _this.allowedCodeDigits = Discover.getAllowedCodeDigits();
        _this.codeLocation = Discover.getCodeLocation();
        _this.startDigits = Discover.getStartDigits();
        return _this;
    }

    /**
     * Get list of digits which can be on begining of card.
     *
     * @returns {[string]} list of digits
     */


    createClass(Discover, null, [{
        key: 'getStartDigits',
        value: function getStartDigits() {
            return ['65', '6011', '644649', '622126622925'];
        }

        /**
         * Where is code located?
         *
         * @returns {Location} code location
         */

    }, {
        key: 'getCodeLocation',
        value: function getCodeLocation() {
            return 'back';
        }

        /**
         * How many digits have code?
         *
         * @returns {number} number of digits
         */

    }, {
        key: 'getAllowedCodeDigits',
        value: function getAllowedCodeDigits() {
            return 3;
        }

        /**
         * Get kist of number of digits that can have credit card number.
         *
         * @returns {[number]} list of number of digits
         */

    }, {
        key: 'getAllowedDigits',
        value: function getAllowedDigits() {
            return [16, 19];
        }
    }]);
    return Discover;
}(CreditCard);

/**
 * JCB card
 */
var JCB = function (_CreditCard) {
    inherits(JCB, _CreditCard);

    /** @inheritdoc */
    function JCB(number, expire, code) {
        classCallCheck(this, JCB);

        var _this = possibleConstructorReturn(this, (JCB.__proto__ || Object.getPrototypeOf(JCB)).call(this, number, expire, code));

        _this.name = 'JCB';
        _this.allowedDigits = JCB.getAllowedDigits();
        _this.allowedCodeDigits = JCB.getAllowedCodeDigits();
        _this.codeLocation = JCB.getCodeLocation();
        _this.startDigits = JCB.getStartDigits();
        return _this;
    }

    /**
     * Get list of digits which can be on begining of card.
     *
     * @returns {[string]} list of digits
     */


    createClass(JCB, null, [{
        key: 'getStartDigits',
        value: function getStartDigits() {
            return ['35'];
        }

        /**
         * Where is code located?
         *
         * @returns {Location} code location
         */

    }, {
        key: 'getCodeLocation',
        value: function getCodeLocation() {
            return 'back';
        }

        /**
         * How many digits have code?
         *
         * @returns {number} number of digits
         */

    }, {
        key: 'getAllowedCodeDigits',
        value: function getAllowedCodeDigits() {
            return 3;
        }

        /**
         * Get kist of number of digits that can have credit card number.
         * https://www.cybersource.com/developers/getting_started/test_and_manage/best_practices/card_type_id/
         *
         * @returns {[number]} list of number of digits
         */

    }, {
        key: 'getAllowedDigits',
        value: function getAllowedDigits() {
            return [16, 17, 18, 19];
        }
    }]);
    return JCB;
}(CreditCard);

/**
 * Maestro card
 */
var MaestroCard = function (_CreditCard) {
    inherits(MaestroCard, _CreditCard);

    /** @inheritdoc */
    function MaestroCard(number, expire, code) {
        classCallCheck(this, MaestroCard);

        var _this = possibleConstructorReturn(this, (MaestroCard.__proto__ || Object.getPrototypeOf(MaestroCard)).call(this, number, expire, code));

        _this.name = 'Maestro Card';
        _this.allowedDigits = MaestroCard.getAllowedDigits();
        _this.allowedCodeDigits = MaestroCard.getAllowedCodeDigits();
        _this.codeLocation = MaestroCard.getCodeLocation();
        _this.startDigits = MaestroCard.getStartDigits();
        return _this;
    }

    /**
     * Get list of digits which can be on begining of card.
     *
     * @returns {[string]} list of digits
     */


    createClass(MaestroCard, null, [{
        key: 'getStartDigits',
        value: function getStartDigits() {
            return ['50', '56', '57', '58', '59', '61', '62', '63', '64', '65', '66', '67', '68', '69'];
        }

        /**
         * Where is code located?
         *
         * @returns {Location} code location
         */

    }, {
        key: 'getCodeLocation',
        value: function getCodeLocation() {
            return 'back';
        }

        /**
         * How many digits have code?
         *
         * @returns {number} number of digits
         */

    }, {
        key: 'getAllowedCodeDigits',
        value: function getAllowedCodeDigits() {
            return 3;
        }

        /**
         * Get kist of number of digits that can have credit card number.
         *
         * @returns {[number]} list of number of digits
         */

    }, {
        key: 'getAllowedDigits',
        value: function getAllowedDigits() {
            return [12, 13, 14, 15, 16, 17, 18, 19];
        }
    }]);
    return MaestroCard;
}(CreditCard);

var cards = {
    MasterCard: MasterCard,
    Visa: Visa,
    AmericanExpress: AmericanExpress,
    DinersClub: DinersClub,
    Discover: Discover,
    JCB: JCB,
    MaestroCard: MaestroCard
};

exports.CreditCardFactory = CreditCardFactory;
exports.CreditCard = CreditCard;
exports.cards = cards;

Object.defineProperty(exports, '__esModule', { value: true });

})));
