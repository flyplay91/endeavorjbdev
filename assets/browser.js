(function(){

    'use strict'
  
    var js = false;
    var el = window.document.documentElement;
    var classes = {
          css: {
            opera: 'opera',
            chrome: 'chrome',
            safari: 'safari',
            firefox: 'firefox',
            facebook: 'facebook',
            ie: 'ie',
            edge: 'edge',
            unknown: 'unknown'
          },
          js: {
            opera: 'js-opera',
            chrome: 'js-chrome',
            safari: 'js-safari',
            firefox: 'js-firefox',
            facebook: 'js-facebook',
            ie: 'js-ie',
            edge: 'js-edge',
            unknown: 'js-unknown'
          }
        };
  
    function detectBrowser() {
      var is;
      var jsIs;
      var browser = navigator.userAgent;
      var _css = classes.css;
      var _js = classes.js;
  
      if(browser.indexOf("Chrome") != -1 ){
        if(browser.indexOf('OPR') != -1 ) {
          // Opera uses Chrome as it's engine, so, check it under Chrome's userAgent.
          jsIs = ((js) ? " " + _js.opera: "");
          is = _css.opera + jsIs;
        }else if(browser.indexOf('Edge') != -1 ) {
          jsIs = ((js) ? " " + _js.edge: "");
          is = _css.edge + jsIs;
        }else{
          jsIs = ((js) ? " " + _js.chrome: "");
          is = _css.chrome + jsIs;
        }
      }else if(browser.indexOf("Safari") != -1){
        jsIs = ((js) ? " " + _js.safari: "");
        is = _css.safari + jsIs;
      }else if(browser.indexOf("Firefox") != -1 ) {
        jsIs = ((js) ? " " + _js.firefox: "");
        is = _css.firefox + jsIs;
      }else if(browser.indexOf("FBAN") != -1 || browser.indexOf("FBAV") > -1) {
        jsIs = ((js) ? " " + _js.facebook: "");
        is = _css.facebook + jsIs;
      }else if((browser.indexOf("MSIE") != -1 ) || (!!document.documentMode == true )){
        // If IE > 10
        jsIs = ((js) ? " " + _js.ie: "");
        is = _css.ie + jsIs;
      }else {
        jsIs = ((js) ? " " + _js.unknown: "");
        is = _css.unknown + jsIs;
      }
  
      return is;
    }
  
    function browser() {
      var classString = el.className;
      var newClass = classString.concat(" " + detectBrowser());
      el.className = newClass;
    }
  
    window.onload = setTimeout(browser, 500);
  })();