/* global Swiper */
/**
 * Scripts specific to the product page.
 */
function initProductPage() {
  
  // MAIN IMAGE
  const mainImageSwiperConfig = {
    //init: true,
    mousewheel: false,
    initialSlide: 0,
    grabCursor: true,
    simulateTouch: true,
    allowTouchMove: true,
    touchRatio: 1,
    touchAngle: 40,
    speed: 375,
    loop: true,
    navigation: {
      nextEl: '.swiper-button-next',
      prevEl: '.swiper-button-prev'
    },
    pagination: {
      el: ".swiper-pagination",
      type: "bullets",
      clickable: "true"
    }
  }

  const mainImageSwiper = new Swiper("#product-image-gallery", mainImageSwiperConfig)
  
  // set up gallery nav images
  const galleryNavCallback = ev => mainImageSwiper.slideToLoop(parseInt(ev.target.dataset.index))
  const bindGalleryNav = el => el.addEventListener("click", galleryNavCallback)
  document.querySelectorAll("#product-gallery-nav img").forEach(bindGalleryNav)
  
  // RELATED PRODUCTS
  // const mobileWidth = 480 // should match $small in styles.scss.liquid
  // const slidesMobile = 3
  // const slidesFull = 6
  // const slideCount = document.querySelectorAll("#related-products-gallery .swiper-slide").length;
  // const slideWrapper = document.querySelector("#related-products-gallery .swiper-wrapper");
  // const enoughSlides = slideCount > slidesFull;
  
  // const relatedSwiperConfig = {
  //   //init: true,
  //   mousewheel: false,
  //   initialSlide: 1,
  //   grabCursor: true,
  //   simulateTouch: true,
  //   loop: enoughSlides,
  //   speed: 150,
  //   slidesPerView: window.innerWidth > mobileWidth ? slidesFull : slidesMobile,
  //   spaceBetween: 10,
  //   navigation: {
  //     nextEl: '.swiper-button-next',
  //     prevEl: '.swiper-button-prev'
  //   },
  //   on: {
  //     init: function (slider) {
  //       if (window.innerWidth <= mobileWidth && slideCount <= slidesMobile) {
  //         slideWrapper.style.justifyContent = 'center';
  //       } else if (window.innerWidth > mobileWidth && slideCount <= slidesFull) {
  //         slideWrapper.style.justifyContent = 'center';
  //       }
  //     },
  //   },
  // }
  
  // const relatedProductsSwiper = new Swiper("#related-products-gallery", relatedSwiperConfig)
  // let lastWindowSize = window.innerWidth;
  
  // callback for window resize, we want to toggle between 3 and 6 items in the slider depending on screen width
  // const updateRelatedProductSlides = () => {
  //   let lastMode = (lastWindowSize > mobileWidth) ? 1 : 0
  //   let curMode = (window.innerWidth > mobileWidth) ? 1 : 0
    
  //   if (curMode !== lastMode) {
   //    lastWindowSize = window.innerWidth
  //     relatedProductsSwiper.params.slidesPerView = curMode ? slidesFull : slidesMobile
   //    relatedProductsSwiper.update()
  //   }

 //    if (window.innerWidth <= mobileWidth && slideCount <= slidesMobile) {
  //     slideWrapper.style.justifyContent = 'center';
  //   } else {
  //     slideWrapper.style.justifyContent = '';
  //   }
  //   
  //   if (window.innerWidth > mobileWidth && slideCount <= slidesFull) {
  //     slideWrapper.style.justifyContent = 'center';
  //   } else {
  //     slideWrapper.style.justifyContent = '';
  //   }
  // }
  
  // window.addEventListener("resize", updateRelatedProductSlides);

  // Related Product with Slick slider
  // $('#related-products-gallery .slick-wrapper').on('init', function(event, slick){
  //   $('#related-products-gallery .slick-wrapper.slick-initialized').css({'opacity': '1', 'visibility': 'visible'});
  // });

  var owl = $('#related-products-gallery .owl-carousel');
  owl.owlCarousel({
    loop:true,
    margin:10,
    nav: true,
    responsive: {
        0: {
          items: 3
        },
    
        768: {
          items: 3
        },
    
        1024: {
          items: 4
        },
    
        1366: {
          items: 6
        }
      }
  });
    
}

document.addEventListener("DOMContentLoaded", initProductPage);

if (window.location.hash !== '' && window.location.hash.includes('notify-me')) {
  $(document).ready(function() {
    console.log('1');
    
    $('#notify-me-div h4').click();
    $('#notify-me-div .notify_email').focus();
  });
}