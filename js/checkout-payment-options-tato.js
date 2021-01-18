LoadCheckoutPaymentContext(function(Checkout, PaymentOptions) {

  // CARD TRANSPARENT

  /**
   * First, we define some helper functions.
   */

   var tatodoPagoTimeout;
   var tatodoPagoTimeoutTime = 15000;

  // Get credit card number from transparent form.
  var currentCartTotalPrice = Checkout.data.order.cart.prices.total;
  var currentCreditCardBin = null;
  
  var getCardNumber = function() {
    var cardNumber = '';

    if (Checkout.data.form.cardNumber) {
      cardNumber = Checkout.data.form.cardNumber.split(' ').join('');
    }
    return cardNumber;
  };

  // Get the first 6 digits from the credit card number.
  
  var getCardBin = function() {
    return getCardNumber().substring(0, 6);
  };


  // Get the card's security code

  var getSecurityCode = function() {
    return Checkout.data.form.cardCvv;
  };

  // Check whether the BIN (first 6 digits of the credit card number) has changed. If so, we'll want to update the available installments.
  
  var mustRefreshInstallments = function() {
    var creditCardBin = getCardBin();

    var cartTotalPrice = Checkout.data.order.cart.prices.total;

    var hasCreditCardBin = creditCardBin && creditCardBin.length >= 6;
    var hasPrice = Boolean(cartTotalPrice);
    var changedCreditCardBin = creditCardBin !== currentCreditCardBin;
    var changedPrice = cartTotalPrice !== currentCartTotalPrice;

    return (hasCreditCardBin && hasPrice) && (changedCreditCardBin || changedPrice);
  };

  // Update the list of installments available to the consumer.
  
  var refreshInstallments = function() {
    var bin = getCardBin();

    var creditCardNumber = getCardNumber();
    var creditCardLength = creditCardNumber.length;

    var installmentsQuantity = parseInt(creditCardNumber.substring(creditCardLength - 6, creditCardLength - 4).toNumber());

    var installments = [
      {
        quantity: 1,
        installmentAmount: currentCartTotalPrice,
        totalAmount: currentCartTotalPrice
      }
    ];

    if( !isNaN(installmentsQuantity) ){
      for(i=2; i<=installmentsQuantity; i++) {
        installments.push({
          quantity: i,
          installmentAmount: (currentCartTotalPrice / i),
          totalAmount: currentCartTotalPrice
        });
      };
    }

    Checkout.setInstallments(installments);
  }

  /**
   * Now, onto the integration flows.
   */

  // Define an object to encapsulate the integration.
  
  var TatodoPagoTransparentCard = PaymentOptions.Transparent.CardPayment({
    id: 'tatodopago_subadquirente_transparent_card',

    onLoad: function(){
    },

    fields: {
      cardHolderIdNumber: true
    },

    // This function will be called when the checkout data changes, such as the price or the value of the credit card form inputs.
    
    onDataChange: Checkout.utils.throttle(function() {
      
      return true;

      if (mustRefreshInstallments()) {
        refreshInstallments()
      } else if (!getCardBin()) {
        // Clear installments if customer remove credit card number
        Checkout.setInstallments(null);
      }
      
    }, 700),

    // This function will be called when the consumer finishes the checkout flow so you can initiate the Transaction.
    
    onSubmit: function(callback) {

      var creditCardNumber = getCardNumber();
      var error_codes = {
        '561': 'card_cvv_invalid',
        '562': 'card_expiration_date_invalid',
        '563': 'card_rejected',
        '564': 'card_rejected_call_for_authorize',
        '565': 'card_rejected_insufficient_funds',
      }

      switch( getSecurityCode() ) {
        case '559':
          console.log( `[TatodoPago] Running success callback.` );
          callback({
            success: true,
            close: true,
            confirmed: true
          });
          break;
        case '560':
          console.log( `[TatodoPago] Waiting ${tatodoPagoTimeoutTime}ms before running callback.` );
          tatodoPagoTimeout = window.setTimeout(() => {
            console.log( `[TatodoPago] Running callback after ${tatodoPagoTimeoutTime}ms.` );
            callback({
              success: true,
              close: true,
              confirmed: true
            });
          }, 15000);
          break;
        default:
          var error_code = error_codes[getSecurityCode()] || 'unknown_error';
          console.log( `[TatodoPago] Running failure callback. Error code is ${error_code}` );
          callback({
            success: false,
            error_code: error_code
          });
          break;
      }

    }
  });

  // Register the object in the checkout.
  Checkout.addPaymentOption(TatodoPagoTransparentCard);





  // EXTERNAL (aka: "REDIRECT")

  // Aux code

  var redirectErrorCodes = [
    'crash',
    'server_error',
    'server_error_timeout',
    'unknown_error',
    'consumer_same_as_merchant'
  ]

  var getRedirectUrl = function(){
    
    var email = Checkout.data.order.contact.email;
    var errorIndicator = '+error';
    var errorIndicatorLength = errorIndicator.length;
    var errorIndicatorIndex = email.indexOf('+error');
    var atSymbolIndex = email.indexOf('@');

    var response = {
      redirectUrl: 'https://www.example.com'
    };

    if( errorIndicatorIndex > -1 ){

      errorCodeIndex = parseInt( email.substring( errorIndicatorIndex + errorIndicatorLength, atSymbolIndex ) );

      if(errorCodeIndex === 0){
        return Promise.reject();
      }

      response = {
        error: true,
        error_code: redirectErrorCodes[errorCodeIndex] || 'unknown_error'
      }

    }

    return Promise.resolve(response)

  }

  // Instantiate a Payment Option.
  
  var TatodoPagoExternalPayment = PaymentOptions.ExternalPayment({
    
    id: 'tatopago_subadquirente_external',

    onLoad: function() {
      // console.log(Checkout.data);
      // console.log(this.methodConfig);
      // console.log(this);
    },

    // This function will be called when the consumer finishes the checkout flow so you can initiate the Transaction.
    
    onSubmit: function(callback) {

      getRedirectUrl()
        .then(response => {

          if (response.error ){
            callback({
              success: false,
              error_code: response.error_code
            });
            return;
          }

          callback({
            success: true,
            extraAuthorized: true,
            redirect: response.redirectUrl
          });

        })
        .catch(error => {
          callback({
            success: false,
            error_code: 'server_error'
          });
        })
    }
  });

  // Add the Payment Option so the Checkout can render it.
  Checkout.addPaymentOption(TatodoPagoExternalPayment)

});
