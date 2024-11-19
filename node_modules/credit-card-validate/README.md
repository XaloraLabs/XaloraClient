Credit card validate
============
![codecov](https://img.shields.io/bower/v/credit-card-validate.svg) [![codecov](https://img.shields.io/npm/v/credit-card-validate.svg)](https://www.npmjs.com/package/credit-card-validate) [![codecov](https://codecov.io/gh/fabulator/credit-card-validate/branch/master/graph/badge.svg)](https://codecov.io/gh/fabulator/credit-card-validate) [![codecov](https://travis-ci.org/fabulator/credit-card-validate.svg?branch=master)](https://travis-ci.org/fabulator/credit-card-validate)

This library is for testing the validity of credit cards. It can can check number of digits, luhn algorithm, number of digits in code (CVV, CVC, ...), expiration or type of Credit card.

There are 7 card types built in - American Express, Diners Club, Discover, JCB, Maestro, MasterCard and Visa. I can't guarantee that card type validation will work on 100%. There is not some trustworthy source with information how to detect it right. Most of information comes from https://en.wikipedia.org/wiki/Payment_card_number. You can also add your own credit card types.

You can use package as npm module. Just install it:

```sh
npm install credit-card-validate --save-dev
```

and use it in you project:

```js
var validators = require('credit-card-validate');
var card = new validators.cards.Visa('4111111111111111', new Date('2017-29'), '122');
console.log(card.isValid() ? 'Card is valid' : 'Card is invalid');
```

You can also install it as bower package:
```sh
bower install credit-card-validate
```

and use is very similar as in npm
```js
var card = new CardValidate.cards.MasterCard('5451418521738499', new Date('2018-29'), '432');
console.log(card.isValid() ? 'Card is valid' : 'Card is invalid');
```

It can be also used with RequireJS, CommonJS, Browserify or Webpack.

## Predefined card types

Following card types are currently build in:
- American Express
- Diners Club
- Discover
- JCB
- Maestro
- MasterCard
- Visa

You can get various information from classes from static methods:

```js
// will provide list of length card could be
// eg [13, 16, 19]
CardValidate.cards.Visa.getAllowedDigits()

// get length of code (CVV, CVC, ...)
// eg 3
CardValidate.cards.Visa.getAllowedCodeDigits()

// where can be code found? back or front
// eg front
CardValidate.cards.Visa.getCodeLocation()
```

You can also create object and check validity of various property or all of them by once. To create a card object just push to constructor card number, expire date and code.
```js
var card = CardValidate.cards.AmericanExpress("378282246310005", new Date("2019-12"), "3456");

card.isExpired();
card.isLuhnValid();

// check that card number is in range on card type
card.isCardTypeValid();

card.isNumberOfDigitsValid();

card.isNumberOfCodeDigitsValid();

// check all tests at one
card.isValid();
```

## Custom card type
You can create your own custom credit card. In example I'm using ECMAScript 2015 syntax.

```js
class YouOwnCard extends CardValidate.CreditCard {

    constructor(number, expire, code) {
        super(number, expire, code);
        this.name = 'You Own Card';
        this.allowedDigits = YouOwnCard.getAllowedDigits();
        this.allowedCodeDigits = YouOwnCard.getAllowedCodeDigits();
        this.codeLocation = YouOwnCard.getCodeLocation();
        this.startDigits = YouOwnCard.getStartDigits();
    }

    static getStartDigits() {
        // card have to start with 98 or 99
        return ['99', '98'];
    }

    static getCodeLocation(): string {
        return 'back';
    }

    static getAllowedCodeDigits(): number {
        return 3;
    }

    static getAllowedDigits(): Array<number> {
        return [13, 16, 19];
    }
}

```

## Detect credit card type

With last feature you can detect credit card type based on number. You can to create object of CreditCardFactory a fill it with all credit card you want to support:

```js
var creditCardFactory = CardValidate.CreditCardFactory([CardValidate.cards.DinersClub, CardValidate.cards.JCB]);

// this will return array with both DinersClub and JCB, because number number can be both
console.log(creditCardFactory.find('3');

// this return array with one item JCB card
console.log(creditCardFactory.find('35', new Date('2010-10'), '123');

```
