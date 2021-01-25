
// PayGod implementation of checkout payment options
LoadCheckoutPaymentContext(function(Checkout, Methods) {
  // We create a new instance of the redirect option.
  var PayGodExternalPaymentOption = new PaymentOptions.ExternalPayment({
  	// The option's unique id as set on it's configuration on the Payment Provider so Checkout can match them and merge them.
    id: 'paygod_redirect',

    // This function handles the order submission event.
    onSubmit: function(callback) {

      // We gather the minimum needed information.
      let paygodRelevantData = {
        // You should include all the relevant data here.
        orderId: Checkout.order.cart.id,
        paymentProviderId: Checkout.payment_provider_id,
        currency: Checkout.order.cart.currency,
        total: Checkout.order.cart.prices.total,
        callbackUrls: Checkout.data.callbackUrls
      }

      // We use the Checkout http lib to post a request to our server
      // and fetch the redirect_url
      Checkout.http
        .post('https://paygod.duckdns.org/generate-checkout-url', {
          data: paygodRelevantData
        })
        .then(function(responseBody){
          
          // Once you get the redirect_url, invoke the callback passing it in the
          // object argument with result params.
          if( responseBody.success ){

            callback({ 
              success: true,
              redirect: responseBody.redirect_url,
              extraAuthorized: true // Legacy paameter, but currently required with "true" value. Will be deprecrated soon.
            });

          } else {

            callback({ 
              success: false,
              error_code: responseBody.error_code // Check the documentation for a full list of failure and error codes.
            });

          }
        })
        .catch(function(error) {

          // Handle a potential error in the HTTP request.
          callback({
            success: false,
            error_code: "server_error" // Check the documentation for a full list of failure and error codes.
          });

        });
    }
  });

  var currentTotalPrice = Checkout.data.order.cart.prices.total;
  var currencCardBin = null;

  // SOME HELPER FUNCTIONS

  // Get credit card number from transparent form.
  var getCardNumber = function() {
    var cardNumber = '';
    if (Checkout.data.form.cardNumber) {
      cardNumber = Checkout.data.form.cardNumber.split(' ').join('');
    }
    return cardNumber;
  };

  // Get the first 6 digits from the credit card number.
  var getCardNumberBin = function() {
    return getCardNumber().substring(0, 6);
  };

  // Check whether the BIN (first 6 digits of the credit card number) has changed. If so, we'll want to update the available installments.
  var mustRefreshInstallments = function() {
    var cardBin = getCardNumberBin();
    var hasCardBin = cardBin && cardBin.length >= 6;
    var hasPrice = Boolean(Checkout.data.totalPrice);
    var changedCardBin = cardBin !== currencCardBin;
    var changedPrice = Checkout.data.totalPrice !== currentTotalPrice;
    return (hasCardBin && hasPrice) && (changedCardBin || changedPrice);
  };

  // Update the list of installments available to the consumer.
  var refreshInstallments = function() {
    
    // Let's imagine the app provides this endpoint to obtain installments.
    Checkout.http.post('https://app.acmepayments.com/card/installments', {
      amount: Checkout.data.totalPrice,
      bin: getCardNumberBin()
    }).then(function(response) {
        Checkout.setInstallments(response.data.installments);
    });
  };

  // Now, our Payment Option and it's argument object.
  var PayGodCardOption = new PaymentOptions.Transparent.CardPayment({
    
    // The option's unique id as set on it's configuration on the Payment Provider so Checkout can match them and merge them.
    id: "paygod_transparent_card",
  
  // Event handler for form field input
    onDataChange: Checkout.utils.throttle(function() {
      if (mustRefreshInstallments()) {
        refreshInstallments()
      } else if (!getCardNumberBin()) {
        // Clear installments if customer remove credit card number
        Checkout.setInstallments(null);
      }
    }),
    
    onSubmit: function(callback) {
      // We gather the card info we need
      var paygodCardRelevantData = {
        orderId: Checkout.order.cart.id,
        currency: Checkout.order.cart.currency,
        total: Checkout.order.cart.prices.total,
        card: {
          number: Checkout.data.form.cardNumber,
          name: Checkout.data.form.cardHolderName,
          expiration: Checkout.data.form.cardExpiration,
          cvv: Checkout.data.form.cardCvv,
          installments: Checkout.data.form.cardInstallments
        }
      }
      // Let's imagine the app provides this endpoint to process credit card payments.
      Checkout.http.post('https://paygod.duckdns.org/charge', paygodCardRelevantData)
        .then(function(responseBody){
          if (responseBody.success) {

            // If the charge was successful, invoke the callback indicating we want to close order.
            callback({
              success: true
            });

          } else {

            callback({
              success: false
              error_code: responseBody.error_code // Check the documentation for a full list of failure and error codes.
            });

          }
       })
       .catch(function(error) {
        
         // Handle a potential error in the HTTP request.
         callback({
           success: false,
           error_code: "server_error" // Check the documentation for a full list of failure and error codes.
         });

       });
     }
  })

  // Finally, we add the JS part of our option, i.e. the handlers, to the Checkout object to it can render it according to the configuration set on the Payment provider.
  Checkout.addPaymentOption(PayGodExternalPaymentOption);
  Checkout.addPaymentOption(PayGodCardOption);
})
