/* global Cycle, CoolieScripts, Swiper */

/**
 * A mini-app for the collections page.
 *
 * Handles infinite scrolling, filtering, and image carousels.
 * Also implements a simple caching mechanism for infinite scrolling results.
 *
 * Note that this -completely- replaces the contents of CONTAINER_ELEMENT.
 *
 * collection-template.liquid just generates static placeholders to improve apparent
 * load times. All the action happens here.
 */

function setupCollection() {
  // if this gets loaded on a non-collection page exit early (shouldn't happen... but accidents do)
  if (!location.pathname.includes('collections')) return;
  // convenience
  const { run, http, dom, xs } = Cycle;
  const { div, a, p, img, input, button, form, span, h4, ul, li, label } = dom;

  /** CONFIGURATION & CONSTANTS **/

  // change this if you want a longer or shorter data cache for collections
  const CACHE_TIME_MINUTES = 3;

  // default size for low-res placeholder images
  const THUMB_LOWRES_SIZE = "100";

  // image sizes that will be used in srcset and by lazyloader
  const THUMB_SIZES = ["300", "400", "500", "600", "700", "800", "900"];

  // the wrapper element that the cycle app lives in
  const CONTAINER_ELEMENT = "#coolie-collection-app";

  /** END CONFIGURABLE ITEMS **/

  // used to generate unique cache keys for collections
  const COLLECTION_NAME = location.pathname.match(/collections\/([^/#]*)/)[1]

  // cache limit in milliseconds
  const cacheLimit = CACHE_TIME_MINUTES * 60 * 1000

  // cache key for this page
  const CACHE_KEY = "coolie_collection_state-" + COLLECTION_NAME

  // compile this regex ahead of time since it will be used a lot
  const IMG_URL_REGEX = /(.*?)\.(.{3,4})(\?v=.*)?$/

  const MENU_OPENING = {
    maxHeight: "0px",
    transition: "max-height 0.5s ease",
    overflow: "hidden",
    delayed: {
      maxHeight: "70vh"
    }
  }

  const MENU_CLOSING = {
    maxHeight: "70vh",
    transition: "max-height 0.5s ease",
    overflow: "hidden",
    delayed: {
      maxHeight: "0px"
    }
  }

  const MENU_DEFAULT = {
    maxHeight: "0px",
    transition: "max-height 0.5s ease",
    overflow: "hidden"
  }

  // deals with collection response
  function sanitizeCollectionResponse(res) {
    return res.body && res.body.products ? res.body.products : []
  }

  // checks whether a filter is enabled, given a label for a filter set, a tag to check, and a filters_enabled map from state
  function isFilterEnabled(label, tag, filters_enabled) {
    let set = filters_enabled.get(label)
    if (set && set.has(tag)) return true
    return false
  }

  // finds the position of an option by name in the options list
  // used for product variants, which only have "option1", "option2", etc. tagged in them,
  // not a full option object. So we need to find out which property corresponds to which
  // named option.
  // @return {int|null}
  function getProductOptionPosition(product, optionName) {
    let optionLower = optionName.toLowerCase();
    let foundPos = null
    product.options.forEach((opt, pos) => {
      if (opt.name.toLowerCase() === optionLower) foundPos = pos
    })
    return foundPos === null ? foundPos : foundPos + 1
  }

  /** SCROLL DRIVER **/

  let scrollTimeout;
  // checks the current scroll position
  function ScrollDriver(in$) {
    let handler;

    const check = () => {
      let curY = window.innerHeight + window.scrollY;
      let maxScroll = document.body.scrollHeight;

      return maxScroll - curY
    }

    const handle = (listener) => {
      return () => {
        clearTimeout(scrollTimeout);
        scrollTimeout = setTimeout(() => listener.next(check()), 100);
      }
    }

    return xs.create({
      start: listener => {
        handler = handle(listener)
        window.addEventListener("scroll", handler)
        in$.addListener({ next: handler })
      },
      stop: () => {
        window.removeEventListener("scroll", handler)
        in$.removeListener(handler)
      }
    }).startWith(check())
  }


  /** STATE DRIVER **/

  // initial state, used by state driver
  let state = {
    content: [],
    pages: [],
    filters: [],
    filters_enabled: new Map(),
    menus_open: new Set(),
    menus_closing: new Set(),
    ready: false,
    loading: false
  }

  // driver for managing app state and loading to / from cache
  function StateDriver(in$) {

    let handler

    // used to convert cached [[label, [tag,...]], ...] to Map([label, Set([tag,...])])
    function makeFiltersEnabled(filters) {
      return new Map(filters.map(([label, set]) => [label, new Set(set)]))
    }

    function toggleFilter(label, tag, filters_enabled) {
      if (!filters_enabled.get(label)) filters_enabled.set(label, new Set())
      let set = filters_enabled.get(label)
      if (!set.has(tag)) set.add(tag)
      else set.delete(tag)
    }

    // serialize loaded page data
    function ser(state) {
      let { pages, filters_enabled, menus_open } = state
      return JSON.stringify({
        pages,
        filters_enabled: [...filters_enabled].map(([label, tags]) => ([label, [...tags]])),
        menus_open: [...menus_open]
      })
    }

    // deserialize cached page data
    function de(string) {
      let parsed = JSON.parse(string);
      return {
        pages: parsed.pages
          ? parsed.pages.map(page => ({
            data: page.data,
            timestamp: new Date(page.timestamp)
          }))
          : [],
        filters_enabled: makeFiltersEnabled(parsed.filters_enabled),
        menus_open: new Set(parsed.menus_open)
      }
    }

    function meetsAllFilterCategories(product, filters_enabled) {
      let matches = 0
      for (const set of filters_enabled.values()) {
        if (set.size === 0) matches += 1
        else if (product.tags.find(tag => set.has(tag.toUpperCase()))) matches += 1
      }
      return matches >= filters_enabled.size
    }

    // composes paginated data into a flat array for use in vdom
    function buildContent(pages, filters_enabled) {
      let content = []
      pages.forEach(page => {
        content = content.concat(page.data.filter(product => meetsAllFilterCategories(product, filters_enabled)))
      })
      return content
    }

    // Loads and validates cache data.
    function loadCache() {
      if (sessionStorage === undefined
        || !sessionStorage.getItem('referer-url')
        || (sessionStorage.getItem('referer-url') && !sessionStorage.getItem('referer-url').includes('/products/'))) {
          console.info('removing cache');
          sessionStorage.removeItem(CACHE_KEY);
          return state
      }
      let string = sessionStorage.getItem(CACHE_KEY)
      
      if (!string) return state
      let cached = de(string)
      if (!cached) return state
      // check cache expiry
      let { pages,  filters_enabled, menus_open } = cached
      let lastPageTime = pages.reduce((a, c) => Math.max(c.timestamp.getTime(), a), 0)
      let ok = pages && (lastPageTime + cacheLimit) > Date.now()
      if (!ok) {
        sessionStorage.removeItem(CACHE_KEY)
        return state
      }

      let content = buildContent(pages, filters_enabled)
      let ready = !!content.length

      return Object.assign({}, state, { content, pages, filters_enabled, menus_open, ready })
    }

    // Stores state to cache.
    function saveCache(state) {
      if (sessionStorage === undefined) return
      sessionStorage.setItem(CACHE_KEY, ser(state))
    }

    // Handler for StateUpdate stream events.
    const handle = (listener) => ({
      next: update => {
        let pages, filters, filters_enabled, menus_open, menus_closing, content
        switch (update.type) {
          case "CONTENT":
            if (!update.page.length) return
            pages = state.pages.concat([{ data: update.page, timestamp: new Date() }])
            content = buildContent(pages, state.filters_enabled)
            state = Object.assign({}, state, { content, pages, ready: true })
            saveCache(state)
            listener.next(state)
            break;
          case "LOADING":
            if (update.loading === state.loading) return
            state = Object.assign({}, state, { loading: update.loading })
            listener.next(state)
            break;
          case "SIDEBAR":
            if (!update.blocks) return
            filters = update.blocks
              .filter(entry => entry.filter_tags && entry.filter_name)
              .map(entry => ({
                label: entry.filter_name,
                tags: entry.filter_tags.toUpperCase().split(", ")
              }))
            state = Object.assign({}, state, { filters })
            listener.next(state)
            break;
          case "FILTER_TOGGLE":
            if (!update.tag || !update.label) return
            filters_enabled = makeFiltersEnabled([...state.filters_enabled])
            toggleFilter(update.label, update.tag, filters_enabled)
            content = buildContent(state.pages, filters_enabled)
            state = Object.assign({}, state, { content, filters_enabled })
            saveCache(state)
            listener.next(state)
            break;
          case "MENU_TOGGLE":
            if (!update.menu) return
            if (state.menus_open.has(update.menu)) {
              menus_open = new Set()
              menus_closing = new Set([update.menu])
            } else {
              menus_closing = new Set(state.menus_open)
              menus_open = new Set([update.menu])
            }
            state = Object.assign({}, state, { menus_open, menus_closing })
            saveCache(state)
            listener.next(state)
        }
      }
    })

    // Initialize state with cache
    state = loadCache(state)

    return xs.create({
      start: listener => {
        handler = handle(listener);
        in$.addListener(handler)
      },
      stop: () => in$.removeListener(handler)
    }).startWith(state)
  }

  /** VDOM UTILITY FUNCTIONS **/

  // parses a default img src and inserts a size wart at the end of the filename
  const imgSizeUrl = (src, size) => {
    const [url, ftype, vers] = src.match(IMG_URL_REGEX).slice(1);
    return `${url}_${size}x.${ftype}${vers}`;

  }

  // build collection-based product url
  const productUrl = product => `${window.location.pathname}/products/${product.handle}`

  // are any of the product's variants available, or are they all sold out?
  const isAvailable = product => !!(product.variants && product.variants.find(v => v.available))

  // adds appropriate symbol to money (for now just dollars, edit here to use Shopify.formatMoney to support intl. currency later)
  const formatMoney = price => "$" + price

  // this link takes you to the notify page, for products that are out of stock
  const notifyMeLink = (product) => a(
    { props: { href: productUrl(product) + "#notify-me" } },
    p(
      { props: { id: "thumbnail-notify-me" } },
      "Notify me when this product is in stock"
    )
  )

  /** VDOM ELEMENTS **/

  // size selector bar that shows up on hover
  const sizeSelector = (product) => {
    return div(".hover-size-optin",
      div(".sizelist", isAvailable(product)
        ? product.variants // is in stock
          .map(variant => form(".product_form.init.product_form_options",
            {
              props: {
                id: `product-form-${variant.id}`
              },
              dataset: {
                enableState: true,
                // product: JSON.stringify(product),
                productId: product.id
              }
            },
            [
              input({
                props: { type: "hidden", name: "id", value: variant.id }
              }),
              button(
                {
                  props: {
                    type: "submit",
                    id: "submit-" + variant.id,
                    ...((!variant.available) && { title: "Out of Stock", className: "not-available" }),
                  }
                },
                variant["option" + getProductOptionPosition(product, "Size")]
              )
            ]
          )) // .map
        : notifyMeLink(product) // not in stock
      ) // div.sizelist
    ) // div.hover-size-optin
  }

  // -> { minPrice: int, comparePrice: <int|undefined> }
  const productPrices = product => {
    let minPrice = Infinity, comparePrice;
    product.variants.forEach(v => {
      if (v.price < minPrice) {
        minPrice = Math.round(v.price);
        comparePrice = Math.round(v.compare_at_price);
      }
    })
    return { minPrice, comparePrice }
  }

  // price line for product caption
  const priceLine = product => {
    const prices = productPrices(product)
    if (prices.comparePrice) {
      return span(".price.sale", [
        span(".money", formatMoney(prices.minPrice)),
        span(".was_price", span(".money", formatMoney(prices.comparePrice)))
      ])
    }
    return span(".price", span(".money", formatMoney(prices.minPrice)))
  }

  // caption below product thumbnail
  const productCaption = (product) => a(
    ".product-info__caption",
    { props: { href: productUrl(product) } },
    div(".product-details", [
      span(".title", { props: { itemprop: "name" } }, product.title),
      priceLine(product)
    ])
  )

  // srcset for image based on its URL, as defined by THUMB_SIZES array
  const imgSrcSet = (src) =>
    THUMB_SIZES.map(size => `${imgSizeUrl(src, size)} ${size}w`).join(", ")

  // low-res placeholder image for thumbnails, plus src set for lazyloading
  const thumbImg = (product) => img(`.product-thumb-image.lazyload.product-thumb-${product.id}`, {
    props: {
      src: imgSizeUrl(product.images[0].src, THUMB_LOWRES_SIZE),
      alt: " "
    },
    dataset: {
      sizes: "auto",
      srcset: imgSrcSet(product.images[0].src)
    }
  });

  // slider image, for carousel
  const sliderImg = (image,  product) => div('.swiper-slide', a(".swiper-wrapper", { props: { href: productUrl(product) } }, img(`.lazyload`, {
    props: {
      src: imgSizeUrl(image.src, THUMB_LOWRES_SIZE),
      alt: " "
    },
    dataset: {
      sizes: "auto",
      srcset: imgSrcSet(image.src)
    }
  })));

  const swiperConfig = {
    touchMove: true,
    speed: 250,
    infinite: true,
    slidesToShow: 1,
    slidesToScroll: 1,
  }

  function swiperInit(element, product) {
    swiperConfig.prevArrow = $(`#swiper-wrapper-${product.id} .swiper-button-prev`);
    swiperConfig.nextArrow = $(`#swiper-wrapper-${product.id} .swiper-button-next`);
    
    $(element).slick(swiperConfig);
  }

  // builds the swiper carousel for product thumbnails
  const productCarousel = (product) => {
    const productImagesCopy = Object.assign([], product.images);
    const firstImage =  Object.assign({}, productImagesCopy[0]);
    const maxProductImagesPre = productImagesCopy.splice(1, 3);
    maxProductImagesPre.push(firstImage);
    const maxProductImages = maxProductImagesPre;
    return div("#swiper-container-" + product.id + ".swiper-container .count-" + maxProductImages.length,
      { hook: { insert: () => swiperInit("#swiper-container-" + product.id, product) } },
      maxProductImages.map((i) => sliderImg(i, product))
    )
  }

  // product thumbnail image wrapper, carousel and widgets composed here
  const productThumb = (product) =>  {
    const contents = [
      div("#swiper-wrapper-" + product.id + ".image__container", [
        div(".prod-image-wrap", a(
          {
            props: {
              href: productUrl(product),
              itemprop: "url"
            }
          },
          thumbImg(product)
        )),
        productCarousel(product),
        sizeSelector(product),
        div(`.swiper-button-prev`),
        div(`.swiper-button-next`)
      ]), // .image__container
      div(".thumbnail-overlay", a(".hidden-product-link", { props: { href: productUrl(product) } }))
    ] // contents
    if (!isAvailable(product)) contents.push(div(".soldOutIcn", "SOLD OUT"));
    return div(".product_image", contents)
  }

  // builds the product grid content area
  const buildGridContent = (state) => {
    if (state.content.length === 0) return p(".quote", CoolieScripts.collectionNoMatches)
    return div(".product-grid-content" + (state.ready ? "" : ".loading"), state.content.map(product => div(".thumbnail.product-grid-item", [
      productThumb(product),
      productCaption(product)
    ])))
  }

  // builds a single filter tag block
  const buildFilterMenu = (state) => (filter) => div(".sidebar-block",
    div(".sidebar__collection-filter", [
      h4(".toggle", { dataset: { menu: filter.label } }, [
        filter.label,
        span(
          `.right${state.menus_open.has(filter.label) ? ".icon-up-arrow" : ".icon-down-arrow"}`,
          { dataset: { menu: filter.label } }
        )
      ]),
      ul(
        `.toggle_list${state.menus_open.has(filter.label) ? ".active" : state.menus_closing.has(filter.label) ? ".closing" : "" }`,
        {style: (state.menus_closing.has(filter.label) ? MENU_CLOSING : state.menus_open.has(filter.label) ? MENU_OPENING : MENU_DEFAULT)},
        filter.tags.map(tag => li(
          a(
            `${isFilterEnabled(filter.label, tag, state.filters_enabled) ? ".active" : ""}`,
            label(".filter-toggle", { dataset: { tag, label: filter.label } }, [input({ props: { type: "checkbox", value: tag, name: `color__${tag.toLowerCase()}` } }), tag])
          )
        ))
      ),
      div(".line")
    ])
  )

  // builds the filter sidebar
  function buildSidebar(state) {
    return div(".sidebar.four.columns",
      div(".sidebar-wrap", [
        div(".sidebar-block", div(".sidebar__collection-filter", h4(".toggle", "Browse By"))),
        ...state.filters.map(buildFilterMenu(state))
      ])
    )
  }

  // main function for constructing the vdom from app state
  function buildVdom(state) {
    let contents = [
      buildSidebar(state),
      buildGridContent(state)
    ]
    if (state.loading) contents.push(div(".load-more__icon"))
    return div(".collection-main", contents)
  }

  /**
   * Collections app main() function sets up cycle stream pipelines.
   * If the author of this script was hit by a bus and you don't know cycle.js,
   * check the docs at https://cycle.js.org
   */
  function main({ HTTP, SCROLL, STATE, DOM }) {
    const pageNum$ = STATE.map(state => state.pages.length + 1)

    let reqReady$ = xs.create();

    // we need to trigger on scrolled to bottom, but only when ready for another batch,
    // and pass in current page count
    const reqPre$ = reqReady$.map(([loading, pageNum, pagesRequested, scroll]) => {
      const maxPossibleScroll = window.innerWidth < 801 ? 900 : 800;
      if ((pageNum > 1 && scroll > maxPossibleScroll) || pagesRequested.includes(pageNum) || loading) return
      return {
        url: `${window.location.pathname}/products.json?limit=${CoolieScripts.collectionPaginationLimit}&page=${pageNum}`,
        category: 'page',
        pageNum
      }
    })
    const req$ = reqPre$.filter(req => req !== undefined).remember()
    const res$ = HTTP.select('page').flatten().map(sanitizeCollectionResponse)
    const pagesRequested$ = req$.fold((a, c) => { a.push(c.pageNum); return a }, [])

    const lastPage$ = res$.filter(res => res.length === 0);

    // only do a scroll when req and res are balanced
    const counter$ = xs.combine(
      req$.fold(acc => acc + 1, 0),
      res$.fold(acc => acc + 1, 0)
    ).startWith([0, 0])

    // we're ready for another request if the counters match
    const loading$ = counter$.map(([req, res]) => req !== res)

    // => ...[loading, pageNum, pagesRequested, scrollLevel]...
    reqReady$.imitate(
      xs.combine(loading$, pageNum$, pagesRequested$, SCROLL).endWhen(lastPage$)
    );

    const vdom$ = STATE.filter(state => state.ready).map(buildVdom)

    const stateUpdate$ = xs.merge(
      res$.map(page => ({ type: "CONTENT", page })),
      loading$.map(loading => ({ type: "LOADING", loading })),
      DOM.select('.filter-toggle').events('click', { preventDefault: true }).map(ev => ({ type: "FILTER_TOGGLE", tag: ev.target.dataset.tag, label: ev.target.dataset.label })),
      DOM.select('h4.toggle').events('click', { preventDefault: true }).map(ev => ({ type: "MENU_TOGGLE", menu: ev.target.dataset.menu }))
    ).startWith(
      { type: "SIDEBAR", blocks: CoolieScripts.collectionSidebarBlocks }
    )

    /* disable in prod! spams console */
    const log$ = xs.merge(
      req$.map(req => ({ type: "HTTPRequest", req })),
      // reqReady$.map(([loading, pageNum, pagesRequested, scrollLevel]) => ({ type: "ReqReady", loading, pageNum, pagesRequested, scrollLevel })),
      res$.map(res => ({ type: "HTTPResponse", res })),
      // vdom$.map(vdom => ({ type: "VDOMUpdate", vdom })),
      STATE.map(state => ({ type: "State", state })),
      stateUpdate$.map(update => ({ type: "StateUpdate", update })),
      // SCROLL.map(level => ({ type: 'Scroll', level })),
      lastPage$.mapTo({ type: "LastPage" })
      // DOM.select('h4.toggle').events('click', { preventDefault: true }).map(ev => ({ type: 'Click', ev }))
    )
    // const log$ = xs.of("Collections mini-app initialized.") // production log
      
    return {
      DOM: vdom$,
      STATE: stateUpdate$,
      SCROLL: vdom$, // ping the scroll checker on state changes
      HTTP: req$,
      LOG: log$
    }
  }

  run(main, {
    DOM: dom.makeDOMDriver(CONTAINER_ELEMENT),
    HTTP: http.makeHTTPDriver(),
    SCROLL: ScrollDriver,
    STATE: StateDriver,
    LOG: msg$ => msg$.addListener({next: msg => console.log(msg) })
  });
}

document.addEventListener('DOMContentLoaded', setupCollection);

const SS_COLLECTION_SCROLL = 'collection-scroll';
const SS_REFERER_URL = 'referer-url';
const SS_COLLECTION = 'collection-url';
const refererUrl = sessionStorage.getItem(SS_REFERER_URL);
const scrollPoss = sessionStorage.getItem(SS_COLLECTION_SCROLL);
const collectionUrl = sessionStorage.getItem(SS_COLLECTION);

document.addEventListener('DOMContentLoaded', () => {
    if (refererUrl && refererUrl.includes('/products/') && (collectionUrl && collectionUrl === window.location.pathname) && parseFloat(scrollPoss) > 0) {
      document.documentElement.scrollTop = document.body.scrollTop = parseFloat(scrollPoss);
      sessionStorage.setItem(SS_COLLECTION_SCROLL, 0);
      sessionStorage.removeItem('coolie_collection_state-new-arrivals');
      sessionStorage.removeItem('coolie_collection_state-dresses');
      sessionStorage.removeItem('coolie_collection_state-bottoms');
      sessionStorage.removeItem('coolie_collection_state-tanks');
    } else {
      document.documentElement.scrollTop = document.body.scrollTop = 0;
      sessionStorage.setItem(SS_COLLECTION_SCROLL, 0);
      sessionStorage.setItem(SS_REFERER_URL, window.location.pathname);
    }

    sessionStorage.removeItem(SS_REFERER_URL);
});

const handleScrollFunc = (e) => sessionStorage.setItem(SS_COLLECTION_SCROLL, window.scrollY);

$(document).on('ready', () => {
  $(window).on('scroll', handleScrollFunc);
});


$('.collection-template-section').on('mouseenter', '.slick-slider', function() {
  $(this).slick('resize');
  window.dispatchEvent(new Event('resize'));
});