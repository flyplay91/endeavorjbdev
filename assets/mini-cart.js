/* global Cycle */

/**
 * A mini-app for the mini-cart ("Bag Module/Ajax Cart").
 *
 * Handles the mini-cart view as well as events related to adding,
 * removing, and updating items, and showing/hiding the cart.
 */
function setupCart() {
  // convenience
  const { run, http, dom, xs } = Cycle;
  const delay = Cycle.extra.delay;
  const { div, a, i, p, img, strong, input, form, span, ul, li } = dom;

  // route shipping product needs special treatment
  const ROUTE_ID = 4351387172966;

  // the wrapper element that the cycle app lives in
  const CONTAINER_ELEMENT = "#coolie-cart-app";

  // cache key for the cart
  const CACHE_KEY = "coolie_cart_state"

  // compile this regex ahead of time since it will be used a lot
  const IMG_URL_REGEX = /(.*?)\.(.{3,4})(\?v=.*)?$/

  // list of product option values that will be displayed on cart line items
  const DISPLAY_OPTIONS = ["color", "size"];

  // STYLE CONSTANTS
  // styles that animate elements on insert/remove/change
  // these are animated and controlled by the dom driver (seems to improve performance and reliability vs. leaving in the stylesheet)
  // styles unrelated to animation live in the stylesheet (under #Mini-Cart heading)
  const CART_ITEM_STYLES = {
    maxHeight: '0px',
    minHeight: '0px',
    opacity: '0',
    transition: 'max-height 0.2s ease, min-height 0.2s ease, opacity 0.21s ease',
    delayed: {
      maxHeight: 'inherit',
      minHeight: 'inherit',
      opacity: 1
    },
    remove: {
      maxHeight: '0px',
      minHeight: '0px',
      opacity: 0
    },
    destroy: {
      maxHeight: '0px',
      minHeight: '0px',
      opacity: 0
    }
  }

  const CART_CONTENT_STYLES = {
    opacity: '1',
    transition: 'opacity 0.25s ease',
    delayed: {
      opacity: '1'
    },
    remove: {
      opacity: '0'
    },
    destroy: {
      opacity: '0'
    }
  }

  // timing of open/close animations
  const OPEN_TIMING = '0.3s'

  // overlay fade in/out
  const OVERLAY_STYLE = {
    opacity: '0',
    display: 'block',
    transition: `opacity ${OPEN_TIMING} ease`,
    delayed: {
      opacity: '0.9',
      display: 'block'
    },
    remove: {
      opacity: '0',
      display: 'none'
    },
    destroy: {
      opacity: '0',
      display: 'none'
    }
  }

  // cart sidebar fly in/out
  const MINI_CART_STYLE = {
    transform: 'translateX(100%)',
    transition: `transform ${OPEN_TIMING} ease`,
    delayed: {
      transform: 'translateX(0)'
    },
    remove: {
      transform: 'translateX(100%)'
    },
    destroy: {
      transform: 'translateX(100%)'
    }
  }

  /** utilities **/

  // finds a parent element matching className (for when a click target is an inner element)
  function seekParent(el, className) {
    let target = el
    while (target.parentElement && target.classList.contains(className) === false) {
      target = target.parentElement
    }
    if (target.tagName === "HTML" || target.classList.contains(className) === false) return false
    return target
  }

  // finds the position of an option by name in the options list
  // used for product variants, which only have "option1", "option2", etc. tagged in them,
  // not a full option object. So we need to find out which property corresponds to which
  // named option.
  /* @return {int|null}
  function getProductOptionPosition(product, optionName) {
    let optionLower = optionName.toLowerCase();
    let foundPos = null
    product.options.forEach((opt, pos) => {
      if (opt.name.toLowerCase() === optionLower) foundPos = pos
    })
    return foundPos === null ? foundPos : foundPos + 1
  }
  */

  // handles changing elements outside the app (bag item count display, body class)
  function CartExternalSideEffectDriver(update$) {
    update$.addListener({
      next: update => {
        let state, productBody
        switch (update.type) {
          case "stateChange":
            state = update.data;
            productBody = document.querySelector('body.product .outer-wrap')
            if (state.open) {
              document.querySelector('html').style.maxHeight = '100vh'
              document.querySelector('html').style.overflow = 'hidden'
              // inner container for the product page body should also be frozen
              // if it exists
              if (productBody) {
                // productBody.style.overflowY = 'hidden'
              }
              // give the add to bag button time to show its checkmark animation
              window.setTimeout(() => {
                document.body.classList.add('mini-cart-open')
              }, 350);
            } else {
              document.body.classList.remove('mini-cart-open')
              document.querySelector('html').style.maxHeight = 'auto'
              document.querySelector('html').style.overflow = 'auto'
              if (productBody) {
                // productBody.style.overflowY = 'auto'
              }
            }
            document.querySelectorAll('#bag-icon-text .header_cart_count')[0].innerHTML = ` (${state.cart.item_count || 0})`
            document.querySelectorAll('#bag-icon .cart_count_mobile')[0].innerHTML = ` ${state.cart.item_count || 0}`
            break;
          case "httpRequest":
            if (update.data.category == "cart-add") {
              const addToBagBtn = document.querySelector("form .add_to_cart");
              if (!addToBagBtn) return;
              addToBagBtn.disabled = true;
              addToBagBtn.classList.add('disabled');
              addToBagBtn.classList.add('active');
              addToBagBtn.querySelector("span").classList.remove("fadeInDown");
              addToBagBtn.querySelector("span").classList.add("zoomOut");
              addToBagBtn.querySelector("span").classList.add("animated");
            }
            break;
          case "httpResponse":
            if (update.data.request.category == "cart-add") {
              const addToBagBtn = document.querySelector("form .add_to_cart");
              if (!addToBagBtn) return;

              addToBagBtn.querySelector(".checkmark").classList.add("checkmark-active");

              window.setTimeout(function() {
                addToBagBtn.querySelector(".checkmark").classList.remove("checkmark-active");
                addToBagBtn.removeAttribute("disabled");
                addToBagBtn.classList.remove("disabled");
                addToBagBtn.classList.remove("active");
                addToBagBtn.querySelector("span").classList.remove("zoomOut");
                addToBagBtn.querySelector("span").classList.add("fadeInDown");
              }, 1000);
            }
            break;
          default:
            break;
        }
      },
      stop: () => {}
    })
  }

  /**
   * handles listening for outside events that change the cart
   */
  function CartEventDriver() {

    let addHandler;
    const setupAddHandler = (listener) => {
      addHandler = ev => {
        if (
          ev.target.tagName === "FORM" &&
          ev.target.classList.contains("product_form") &&
          ev.target.dataset.productId) {
          ev.preventDefault();
          ev.stopPropagation();
          let data = new FormData(ev.target)
          data.id = ev.target.dataset.productId
          let prepared = {}
          data.forEach((entry, name) => prepared[name] = entry)
          listener.next({
            category: "cart-add",
            prepared,
            data
          })
        }
      }
      document.body.addEventListener("submit", addHandler)
    }

    let openHandler;
    const setupOpenHandler = (listener) => {
      openHandler = ev => {
        if (
          seekParent(ev.target, "cart-open") ||
          seekParent(ev.target, "mini_cart")
        ) {
          ev.preventDefault();
          ev.stopPropagation();
          listener.next({
            category: "cart-open"
          })
        }
      }
      document.body.addEventListener("click", openHandler)
    }

    let closeHandler;
    const setupCloseHandler = (listener) => {
      closeHandler = ev => {
        let closeParent = seekParent(ev.target, "cart-close")
        let overlayParent = seekParent(ev.target, "cart-overlay")
        if (closeParent || overlayParent) {
          ev.preventDefault();
          ev.stopPropagation();
          listener.next({
            category: "cart-close"
          })
        }
      }
      document.body.addEventListener("click", closeHandler)
    }

    // things that should prompt a cart refresh
    let promptHandler;
    const setupPromptHandler = (listener) => {
      promptHandler = ev => {
        let routeParent = seekParent(ev.target, "route-div")
        if (routeParent) {
          listener.next({
            category: "cart-refresh"
          })
        }
      }
      document.body.addEventListener("click", promptHandler)
    }

    const removeHandlers = () => {
      document.body.removeEventListener("submit", addHandler)
      document.body.removeEventListener("click", openHandler)
      document.body.removeEventListener("click", closeHandler)
      document.body.removeEventListener("click", promptHandler)
    }

    return xs.create({
      start: listener => {
        setupAddHandler(listener);
        setupOpenHandler(listener);
        setupCloseHandler(listener);
        setupPromptHandler(listener);
      },
      stop: () => {
        removeHandlers();
      }
    })
  }

  let state = {
    cart: {},
    open: false
  }
  let handler

  /**
   * handles cart state
   */
  function CartStateDriver(in$) {

    // serialize loaded page data
    function ser(state) {
      return JSON.stringify(state)
    }

    // deserialize cached page data
    function de(string) {
      let parsed = JSON.parse(string);
      return parsed
    }

    // Loads and validates cache data.
    function loadCache() {
      if (sessionStorage === undefined) return state
      let string = sessionStorage.getItem(CACHE_KEY)
      if (!string) return state
      let cached = de(string)
      if (!cached) return state
      return cached
    }

    // Stores state to cache.
    function saveCache(state) {
      if (sessionStorage === undefined) return
      sessionStorage.setItem(CACHE_KEY, ser(state))
    }

    // Handle state change events
    const handle = (listener) => ({
      next: update => {
        let items
        switch (update.type) {
          case "cart-data":
            state = Object.assign({}, state, { cart: update.data })
            saveCache(state)
            listener.next(state)
            break;
          case "cart-open":
            state = Object.assign({}, state, { open: true })
            saveCache(state)
            listener.next(state)
            break;
          case "cart-close":
            state = Object.assign({}, state, { open: false })
            saveCache(state)
            listener.next(state)
            break;
          case "cart-update-quantity":
            items = state.cart.items;
            items.find(item => item.variant_id === update.data.id).quantity = update.data.quantity
            state = Object.assign({}, state, { items })
            saveCache(state)
            listener.next(state)
            break;
        }
        // do something
      },
      stop: () => {}
    })

    // initialize state with cache
    state = loadCache(state)

    return xs.create({
      start: listener => {
        handler = handle(listener);
        in$.addListener(handler)
      },
      stop: () => in$.removeListener(handler)
    }).startWith(state)
  }

  // parses a default img src and inserts a size wart at the end of the filename
  const imgSizeUrl = (src, size) => {
    const [url, ftype, vers] = src.match(IMG_URL_REGEX).slice(1);
    return `${url}_${size}x.${ftype}${vers}`;

  }

  // adds appropriate symbol to money (for now just dollars, edit here to use Shopify.formatMoney to support intl. currency later)
  const formatMoney = price => "$" + (price / 100).toFixed(2)

  const freeShippingProgress = (cart) => Math.min(100, (cart.total_price / 100))
  const freeShippingProgress_2 = function(cart) {
    var progress = ((cart.total_price) / 20000) * 100;
    return progress > 100 ? 100 : progress;
  }

  const freeShippingRemaining = (cart) => Math.max(200 - freeShippingProgress(cart), 0)
  const freeShippingRemaining_2 = function(cart) {
    return ((20000 - cart.total_price) / 100).toFixed(2);
  }

  /** VDOM STUFF BELOW **/

  const freeShippingOkText = p(".free-shipping-text", "You have free U.S. shipping")

  // builds the shipping meter at the top of the cart
  const buildFreeShippingMeter = cart => {
    let text, wrapperClass

    if (freeShippingRemaining_2(cart) > 0) {
      // '<span class="cart_count">' + cart.item_count  + '</span><span class="item-count">items in bag</span><p class="cart-shipping-text"><span>You are</span><span class="remaining-money">' + formatMoney(freeShippingRemaining_2(cart) * 100) + '</span><span> away from free U.S. shipping</span></p>'
      text = p(".cart-shipping-text", [
        span(".cart_count", cart.item_count),
        span(".item-count", " items in bag | "),
        span("You are "),
        span(".remaining-money", formatMoney(freeShippingRemaining_2(cart) * 100)),
        span(" away from free U.S. shipping")
      ])
      
      wrapperClass = ".non-free-shipping-bar"
    } else {
      // text = freeShippingOkText
      text = text = p(".cart-shipping-text", [
        span(".cart_count", cart.item_count),
        span(".item-count", " items in bag | "),
        span("You have free U.S. shipping")
      ])

      wrapperClass = ".free-shipping-bar"
    }

    const progressBar = div(".progress", [
      div(
        ".progress-bar",
        {
          style: {
            width: freeShippingProgress_2(cart) + "%",
            transition: "width 0.25s ease"
          },
          attrs: {
            role: "progressbar",
            "aria-valuenow": freeShippingProgress_2(cart),
            "aria-valuemin": 0,
            "aria-valuemax": 100
          }
        }
      )
    ])
    return div(".free-shipping-rule", div(wrapperClass, [
      text,
      progressBar
    ]))
  }

  // displays a line item's product option if it's in the DISPLAY_OPTIONS array
  const buildVariantOption = (option) => (DISPLAY_OPTIONS.includes(option.name.toLowerCase())) ? div(".item_variant", `${option.name}: ${option.value}`) : ""

  // single cart line item
  const buildCartItem = (item, line_num) => li(
    "#item-" + item.variant_id + `.cart_item ${item.vendor.toLowerCase() === 'route' && '.cart_item--insurance' }`,
    {
      dataset: {
        variantId: item.variant_id
      },
      style: CART_ITEM_STYLES
    },
    [
      div(".cart_image", [
        a({ props: { href: `/products/${item.handle}?${item.variant_id}` } }, [
          img({
            props: {
              src: imgSizeUrl(item.featured_image.url, 400),
              alt: item.featured_image.alt }
          })
        ])
      ]),
      strong(".right.price", [
        span(".money", formatMoney(item.final_line_price))
      ]),
      div(".item_title", [
        a({ props: { href: `/products/${item.handle}?${item.variant_id}` } }, item.product_title)
      ]),
      div(".item_variant", item.options_with_values ? item.options_with_values.map(buildVariantOption) : []),
      // don't let users manually change qty on route shipping item
      (item.product_id == ROUTE_ID) ? "" : div(".product-quantity-box", [
        span(
          ".ss-icon.product-minus.decrease-quantity",
          { dataset: { id: item.variant_id, quantity: "" + Math.max(item.quantity - 1, 0) } },
          span(".icon-minus")
        ),
        input(
          "#updates_" + item.variant_id + ".quantity",
          {
            props: {
              type: "text",
              pattern: "[0-9]+",
              min: 0,
              size: 2,
              name: "updates[]",
              value: item.quantity,
              readonly: true
            }
          },
          { dataset: { lineId: line_num + 1 } }
        ),
        span(
          ".ss-icon.product-plus.increase-quantity",
          { dataset: { id: item.variant_id, quantity: "" + (item.quantity + 1) } },
          span(".icon-plus")
        )
      ]) // .product-quantity-box
    ]
  )

  const buildCartItems = cart => ul(".cart_items",
    cart.items ? cart.items.map(buildCartItem) : []
  )

  const buildCartFooter = cart => ul(".cart-footer", [
    li(".cart_subtotal", [
      span(span(".money", [
        span(".right", formatMoney(cart.total_price || 0)),
        span("Subtotal")
      ])),
      div(".route-div"),
      a(
        "#checkout.button.add_to_cart.btn.inverted",
        { props: { href: "/checkout" } },
        "Checkout"
      ),
      div(".cart_text", [
        p("Shipping and promotions calculated in checkout. By checking out, I agree to the Terms of Use and acknowledge that I have read the Privacy Policy.")
      ])
    ])
  ])

  const buildCartBody = cart => form(
    ".js-cart_content__form",
    {
      props: {
      }
    },
    cart.item_count > 0 ? [
      buildCartItems(cart),
      buildCartFooter(cart)
    ] : ""
  )

  // these are static so don't need to be rebuilt when content changes
  const cartIconClose = a(".cart-close", { props: { href: "#" } }, i(".icon-cross"))
  const cartLogo = div(".cart-logo")
  const cartEmpty = div(".cart-header", { style: CART_CONTENT_STYLES }, [
    cartIconClose,
    cartLogo,
    div(".js-empty-cart_message", p(".empty_cart", "Your Cart is Empty"))
  ])

  // header section includes everything before the line items list
  const buildCartHeader = cart => div(".cart-header", [
    cartIconClose,
    cartLogo,
    // div([
    //   span(".cart_count", cart.item_count),
    //   span(".item-count", " items in bag | "),
    //   buildFreeShippingMeter(cart)
    // ]),
    buildFreeShippingMeter(cart)
  ]) // .cart-header

  // builds everything but the the overlay
  const buildCart = (state) => {
    let items

    if (state.cart.item_count > 0) {
      items = div({ style: CART_CONTENT_STYLES }, [
        buildCartHeader(state.cart),
        buildCartBody(state.cart)
      ])
    } else {
      items = cartEmpty
    }
    
    document.dispatchEvent(new Event('cart-updated', {'bubbles': true}));

    return div(".cart_container", div(".cart_content", { style: MINI_CART_STYLE }, items))
  }

  const overlay = div(".cart-overlay", { style: OVERLAY_STYLE })

  // main function for virtual DOM construction
  const buildVdom = (state) => (state.open ? div(".mini-cart", [overlay, buildCart(state)]) : div(".mini-cart"))

  const CART_GET_REQ = {
    method: "GET",
    url: "/cart.js?timestamp=" + Date.now(),
    category: "cart-get"
  }

  function main({ EVENTS, DOM, HTTP, STATE }) {

    const cartQtyIncrease$ = DOM
      .select('.increase-quantity')
      .events('click', { preventDefault: true })
      .map(ev => {
        let target = seekParent(ev.target, "increase-quantity")
        if (!target) return false
        return {
          id: parseInt(target.dataset.id),
          quantity: parseInt(target.dataset.quantity)
        }
      })
      .filter(ev => !!ev)

    const cartQtyDecrease$ = DOM
      .select('.decrease-quantity')
      .events('click', { preventDefault: true })
      .map(ev => {
        let target = seekParent(ev.target, "decrease-quantity")
        if (!target) return false
        let quantity = parseInt(target.dataset.quantity)
        if (isNaN(quantity) || quantity < 0) return false
        return {
          id: parseInt(target.dataset.id),
          quantity
        }
      })
      .filter(ev => !!ev)

    const cartQtyUpdateReq$ = xs.merge(
      cartQtyDecrease$,
      cartQtyIncrease$
    ).map(ev => {
      let updates = {}
      updates[ev.id] = ev.quantity
      return {
        method: "POST",
        url: "/cart/update.js",
        send: { updates },
        category: "cart-change-quantity"
      }
    })

    const stateCartQtyChange$ = xs.merge(
      cartQtyDecrease$,
      cartQtyIncrease$
    ).map(ev => ({
      type: "cart-update-quantity",
      data: ev
    }))

    // map http responses from cart data requests to state updates
    const stateCartUpdate$ = HTTP
      .select("cart-change-quantity")
      .flatten()
      .map(res => ({
        type: "cart-data",
        data: JSON.parse(res.text)
      }))


    // ask for a fresh copy of the cart whenever we get a response from
    // a request that would update it
    const cartRefresh$ = xs.merge(
      HTTP.select("cart-add").flatten(),
      HTTP.select("cart-update").flatten(),
      EVENTS.filter(ev => ev.category === "cart-refresh").compose(delay(250))
    ).mapTo(CART_GET_REQ)

    // things that cause the mini-cart to open
    const stateCartOpen$ = xs.merge(
      EVENTS.filter(ev => ev.category === "cart-open"),
      HTTP.select("cart-add").flatten()
    ).mapTo({
      type: "cart-open"
    })

    // things that cause the mini-cart to close
    const stateCartClose$ = xs.merge(
      EVENTS.filter(ev => ev.category === "cart-close"),
      DOM.select(".cart-close").events("click", { preventDefault: true })
    ).mapTo({
      type: "cart-close"
    })

    const stateCartRefresh$ = HTTP
      .select("cart-get")
      .flatten()
      .map(res => ({
        type: "cart-data",
        data: JSON.parse(res.text)
      }))

    const stateUpdate$ = xs.merge(
      stateCartUpdate$,
      stateCartQtyChange$,
      stateCartOpen$,
      stateCartClose$,
      stateCartRefresh$
    )

    const httpRequest$ = xs.merge(
      cartRefresh$,
      cartQtyUpdateReq$,
      EVENTS
        .filter(ev => ev.category === "cart-add")
        .map(ev => ({
          method: "POST",
          url: "/cart/add.js",
          send: ev.prepared,
          type: "form",
          category: "cart-add"
        }))
    ).startWith(CART_GET_REQ)

    const vdom$ = STATE.map(buildVdom).remember()

    const effects$ = xs.merge(
      STATE.map(data => ({ type: 'stateChange', data })),
      httpRequest$.map(data => ({ type: 'httpRequest', data })),
      HTTP.select().flatten().map(data => ({ type: 'httpResponse', data }))
    )

    const log$ = xs.of("Mini-cart app loaded.")
    /* xs.merge(
      xs.of({ type: "TEST", message: "Alive!" }),
      EVENTS.map(ev => ({ type: "CartEvent", ev })),
      httpRequest$.map(ev => ({ type: "HTTPRequest", category: ev.category, ev })),
      stateUpdate$.map(update => ({ type: "StateUpdate", update })),
      STATE.map(state => ({ type: "State", state })),
      vdom$.map(vd => ({ type: "VDOM", vd })),
      cartQtyDecrease$.map(req => ({ type: "CartQtyDecrease", req })),
      cartQtyIncrease$.map(req => ({ type: "CartQtyIncrease", req }))
    )
    */

    return {
      DOM: vdom$,
      LOG: log$,
      HTTP: httpRequest$,
      STATE: stateUpdate$,
      EFFECTS: effects$
    }
  }

  run(main, {
    EVENTS: CartEventDriver,
    EFFECTS: CartExternalSideEffectDriver,
    DOM: dom.makeDOMDriver(CONTAINER_ELEMENT),
    HTTP: http.makeHTTPDriver(),
    STATE: CartStateDriver,
    LOG: msg$ => msg$.addListener({ next: msg => console.log(msg) })
  })
}

document.addEventListener('DOMContentLoaded', setupCart)