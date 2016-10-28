var Problem = require('../models/Problem');
var isValid = require('../utils/isValid');
var functionName = require('../utils/fnName');
var isProblem = require('../utils/isProblem');
var namedFn = require('../utils/namedFn');
var conform = require('../utils/conform');
var oAssign = require('object-assign');

function fspec(fnSpec) {
  var argsSpec = fnSpec.args;
  var retSpec = fnSpec.ret;

  var wrapSpecChecker = function (fn) {
    var fnName = functionName(fn);
    var speckedFn = getSpeckedFn(fnName, fn);
    var namedSpecedFn = namedFn(fnName, speckedFn, '__specked');
    return namedSpecedFn;
  }

  var wrapConformedArgs = function (fn) {
    var fnName = functionName(fn);
    var argConformedFn = getArgConformedFn(fnName, fn);
    var namedArgConformedFn = namedFn(fnName, argConformedFn, '__conformed');

    return namedArgConformedFn;
  }

  function getSpeckedFn(fnName, fn) {
    return function () {
      var args = Array.from(arguments);
      checkArgs(fnName, args);
      var retVal = fn.apply(null, args);
      checkRet(fnName, retVal);
      return retVal;
    };
  }

  function getArgConformedFn(fnName, fn) {
    return function () {
      var args = Array.from(arguments);
      // console.log(args);
      // var util = require('util');
      // console.log(util.inspect(argsSpec, false, null));
      var conformedArgs = conform(argsSpec, args);
      if(isProblem(conformedArgs)) {
        throw conformedArgs;
      }
      // console.log(conformedArgs);
      // var util = require('util');
      // console.log(util.inspect(conformedArgs, false, null));
      var retVal = fn.call(null, conformedArgs);
      checkRet(fnName, retVal);
      // console.log(retVal);
      return retVal;
    };
  }

  function checkArgs(fnName, args) {
    if(argsSpec) {
      if(!isValid(argsSpec, args)) {
        throw new Problem(fnName, argsSpec, 'Arguments ' + args + ' passed to function ' + fnName + ' is not valid.');
      }
    }
  }

  function checkRet(fnName, retVal) {
    if(retSpec) {
      if(!isValid(retSpec, retVal)) {
        throw new Problem(retSpec, retSpec, 'Return value ' + retVal + ' for function ' + fnName + ' is not valid.');
      }
    }
  }

  wrapSpecChecker.wrapConformedArgs = wrapConformedArgs;
  oAssign(wrapSpecChecker, fnSpec);

  return wrapSpecChecker;
};

module.exports = fspec;