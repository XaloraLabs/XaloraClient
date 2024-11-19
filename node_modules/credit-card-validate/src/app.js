// @flow
import CreditCardFactory from './CreditCardFactory/CreditCardFactory';
import CreditCard from './CreditCard/CreditCard';
import MasterCard from './CreditCard/Types/MasterCard';
import Visa from './CreditCard/Types/Visa';
import AmericanExpress from './CreditCard/Types/AmericanExpress';
import DinersClub from './CreditCard/Types/DinersClub';
import Discover from './CreditCard/Types/Discover';
import JCB from './CreditCard/Types/JCB';
import MaestroCard from './CreditCard/Types/MaestroCard';

const cards = {
    MasterCard,
    Visa,
    AmericanExpress,
    DinersClub,
    Discover,
    JCB,
    MaestroCard,
};

export {
    CreditCardFactory,
    CreditCard,
    cards,
};
