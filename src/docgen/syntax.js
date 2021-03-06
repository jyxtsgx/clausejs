const { cat, or, shape, zeroOrOne, maybe, oneOrMore, fclause, any, and, wall, ExprClause, collOf } = require( '../core' );
const { isStr, isFn, isNum, isInt, isObj, isBool, instanceOf } = require( '../preds' );
const { conform, isClause, deref, delayed } = require( '../utils' );
const C = require( '../' );
const oAssign = require( '../utils/objectAssign' );
const clauseFromAlts = require( '../utils/clauseFromAlts' );
const fnName = require( '../utils/fnName' );
const stringifyWithFnName = require( '../utils/stringifyWithFnName' );
import sExpression, { genClauses, ParamItemClause,
 UnquotedParamsMap, QuotedParamsMap } from '../utils/sExpression';
import { fragsToStr, interpose, humanReadable,
  INDENT_IN, NEW_LINE, INDENT_OUT } from '../utils/describe';
const match = require( '../utils/match' );

//     ----'first'-----  --------'second'---------
// fn( (isStr, isBool)+, (isObj | (isNum, isBool)) )

//     -----'first'----  ---second--
//                        -(objOpt)-
// fn( (isStr, isBool)+,    isObj     )
//     -----'first'----  ----second----
//                       ---(showNum)--
// fn( (isStr, isBool)+, isNum, isBool )



// fn( { <required>: [ 'propA': isNum, <propB: beginsWithS>: any ], <optional>: [  ] } )

// cat('first', oneOrMore(cat (isStr, isBool), 'second': {...}  ))

// console.log( conform( sample, [ 'hello', true, 'abc', false, 32, false ] ) );

function AltHeadNode( label, clause, enclosed ) {
  this.label = label;
  this.clause = clause;
  this.enclosed = enclosed;
}

var [ PartialableSExprClause, PartialableParamItemClause ] = genClauses(
  or(
    'expression', ExprClause,
    'altNode', and(
      instanceOf( AltHeadNode ),
      C.shape( {
        required: {
          clause: _isPivot,
          enclosed: delayed( () => PartialableParamItemClause )
        }
      } ) )
  )
);

var synopsis = fclause( {
  args: cat( ExprClause, zeroOrOne( isInt ), zeroOrOne( maybe( isFn ) ) )
} ).instrument( function synopsis( clause, limit = 20, replacer ) {
  const sExpr = sExpression( clause );
  const cSExpr = conform( ParamItemClause, sExpr );
  const pivots = _findPivots( cSExpr, replacer );

  const expanded = pivots.reduce( ( cases, pivot ) => {
    const r = cases.reduce( ( acc, currCase ) => {
      if ( acc.length > limit ) {
        return acc;
      } else {
        const { cases } = _expand( currCase, pivot );
        return acc.concat( cases );
      }
    }, [] );
    return r;
  }, [ sExpr ] );
  const results = expanded.map( ( cc ) => _describeCase( cc, replacer ) );
  return results;
} );


function _strFragments(
   label, cNode, replacer ) {
  let result = [];

  if ( label ) {
    result = result.concat( [ label, ': ' ] );
  }
  const { head, params } = _handler( cNode );
  if ( !head ) {
    return [];
  }
  if ( replacer ) {
    let interceptR = replacer( head );
    if ( interceptR ) {
      return result.concat( interceptR );
    }
  }
  if ( head.type === 'PRED' ) {
    return [ `${fnName( head.opts.predicate )}` ];
  }
  let nodeLabel = humanReadable( head );

  let commaedParamFrags;
  if ( head.type === 'FCLAUSE' ) {
    let { unlabelled:
      [ { item: {
          unquotedParamsMap: {
            args: { singleParam: args } = {},
            ret: { singleParam: ret } = {} } } } ] } = params;
    return [ ]
        .concat( args ? _fragmentParamAlts( null, args, replacer ) : [] )
        .concat( [ ' → ' ] )
        .concat( ret ? _fragmentParamAlts( null, ret, replacer ) : [ 'any' ] );
  } else if ( head.type === 'CAT' ) {
    let { labelled, unlabelled } = params;
    let commaedParamFrags = [];
    if ( labelled ) {
      let paramFrags = labelled.reduce(
        ( acc, { label, item } ) => {
          const lblStr = _processLabel( label );
          return acc.concat( [
            [ _fragmentParamAlts( lblStr, item, replacer ) ],
          ] )
        },
        []
     );
      commaedParamFrags = interpose( paramFrags, [ ', ', NEW_LINE ] )
    } else if ( unlabelled ) {
      let paramFrags = unlabelled.map( ( { item } ) =>
        _fragmentParamAlts( null, item, replacer ) );
      commaedParamFrags = interpose( paramFrags, [ ', ', NEW_LINE ] );
    }
    return result.concat( [ '( ' ] )
        .concat( commaedParamFrags )
        .concat( [ ' )' ] );
  } else if ( head.type === 'OR' ) {
    let { labelled, unlabelled } = params;
    let commaedParamFrags = [];
    if ( labelled ) {
      let paramFrags = labelled.reduce(
        ( acc, { item } ) => {
          return acc.concat( [
            [ _fragmentParamAlts( null, item, replacer ) ],
          ] )
        },
        []
     );
      commaedParamFrags = interpose( paramFrags, [ ' | ', NEW_LINE ] )
    } else if ( unlabelled ) {
      let paramFrags = unlabelled.map( ( { item } ) =>
        _fragmentParamAlts( null, item, replacer ) );
      commaedParamFrags = interpose( paramFrags, [ ' | ', NEW_LINE ] );
    }
    return result.concat( [ '{ ' ] )
        .concat( commaedParamFrags )
        .concat( [ ' }' ] );
  } else if ( head.type === 'Z_OR_M' ) {
    let { unlabelled: [ { item } ] } = params;
    let processed = _fragmentParamAlts( null, item, replacer );
    return [ '( ' ].concat( result )
      .concat( [ processed, ' )*' ] );
  } else if ( head.type === 'O_OR_M' ) {
    let { unlabelled: [ { item } ] } = params;
    let processed = _fragmentParamAlts( null, item, replacer );
    return [ '( ' ]
      .concat( result )
      .concat( [ processed, ' )+' ] );
  } else if ( head.type === 'Z_OR_O' ) {
    let { unlabelled: [ { item } ] } = params;
    let processed = _fragmentParamAlts( null, item, replacer );
    return [ '( ' ]
      .concat( result )
      .concat( [ processed, ' )?' ] );
  } else if ( head.type === 'COLL_OF' ) {
    let { unlabelled: [ { item } ] } = params;
    let processed = _fragmentParamAlts( null, item, replacer );
    return [ '[ ' ]
      .concat( result )
      .concat( [ processed, ' ]*' ] );
  } else if ( head.type === 'ANY' ) {
    return result.concat( [ 'any' ] );
  } else if ( head.type === 'SHAPE' ) {
    let r = params.unlabelled[ 0 ].item.unquotedParamsMap;

    let { unlabelled: [ { item: {
      unquotedParamsMap: {
        required: { singleParam: { quotedParamsMap: required } } = { singleParam: {} },
        optional: { singleParam: { quotedParamsMap: optional } } = { singleParam: {} }
     } } } ] } = params;
    let items = [];
    if ( required ) {
      for ( let key in required ) {
        let r1 = match( required[ key ], {
          'keyList': ( list ) => {
            return [ '[ ' ].concat(
              interpose( list.map( ( i ) => `"${i}"` ), [ ', ' ] ) )
              .concat( ' ]' );
          },
          'singleParam': ( p ) =>
            _fragmentParamAlts( null, p, replacer )
        }, () => {
          throw '!e';
        } );
        if ( r1 ) {
          items = items.concat( [ [ `${key}*: `, r1 ] ] );
        }
      }
    }
    if ( optional ) {
      for ( let key in optional ) {
        let r1 = match( optional[ key ], {
          'keyList': ( list ) => {
            return [ '[ ' ].concat(
              interpose( list.map( ( i ) => `"${i}"` ), [ ', ' ] ) )
              .concat( ' ]' );
          },
          'singleParam': ( p ) =>
            _fragmentParamAlts( null, p, replacer )
        }, () => {
          throw '!e';
        } );
        if ( r1 ) {
          items = items.concat( [ [ `${key}?: `, r1 ] ] );
        }
      }
    }
    let commaSepartedItems = interpose( items, [ ', ' ] );
    return result
      .concat( [ '{ ' ] )
      .concat( commaSepartedItems )
      .concat( [ ' }' ] );
  } else if ( head.type === 'AND' ) {
    // TODO: just a temporary hack that takes the first expression
    // need more design decisions
    return _fragmentParamAlts( label, params.unlabelled[ 0 ].item, replacer );
  } else if ( head.type === 'MAP_OF' ) {
    let { unlabelled: [ { item: {
      unquotedParamsMap: {
        key: { singleParam: keyExprAlts },
        val: { singleParam: valExprAlts },
     } } } ] } = params;
    let items = []
      .concat( _fragmentParamAlts( null, keyExprAlts, replacer ) )
      .concat( [ ', ' ] )
      .concat( _fragmentParamAlts( null, valExprAlts, replacer ) );

    return result
      .concat( [ '< ' ] )
      .concat( items )
      .concat( [ ' >' ] );
  } else {
    console.error( head );
    throw 'not supported';
  }
}

function _processLabel( { str, quoted } ) {
  if ( str ) {
    return str;
  } else if ( quoted ) {
    return quoted.value;
  }
}

function _fragmentParamAlts( label, pAlts, replacer ) {
  const r = match( pAlts, {
    'label': _processLabel,
    'sExpression': ( expr ) => _strFragments( label, expr, replacer ),
    'quotedParamsMap': ( o ) => _fragmentParamsObj( o, replacer, false ),
    'unquotedParamsMap': ( o ) => _fragmentParamsObj( o, replacer, false ),
    'optionsObj': ( o ) => stringifyWithFnName( o ),
    'recursive': ( { expression } ) => [
      '<recursive>: ',
      humanReadable( expression )
    ]
  }, ( e ) => {
    console.error( e );
    throw '!s';
  } );
  return r;
}

function _fragmentParamsObj( pObj, replacer ) {
  var r = [ '< ', INDENT_IN, NEW_LINE, ];
  let body = [];
  let { key: keyExprAlts, val: valExprAlts } = pObj;
  var keyR = match( keyExprAlts, {
    'keyList': ( list ) => {
      return [ '[ ' ].concat(
        interpose( list.map( ( i ) => `"${i}"` ), [ ', ' ] ) )
        .concat( ' ]' );
    },
    'singleParam': ( p ) =>
      _fragmentParamAlts( null, p, replacer )
  }, () => {
    throw '!e';
  } );

  var valR = match( valExprAlts, {
    'keyList': ( list ) => {
      return [ '[ ' ].concat(
        interpose( list.map( ( i ) => `"${i}"` ), [ ', ' ] ) )
        .concat( ' ]' );
    },
    'singleParam': ( p ) =>
      _fragmentParamAlts( null, p, replacer )
  }, () => {
    throw '!e';
  } );

  body.push( [ keyR ] );
  body.push( [ valR ] );

  body = interpose( body, [ ', ', NEW_LINE ] );
  r = r.concat( body ).concat( [ INDENT_OUT, NEW_LINE, ' >' ] );
  return r;
}

function _describeCase( c, replacer ) {
  const cc = conform( PartialableSExprClause, c );
  if ( C.isProblem( cc ) ) {
    throw '!!';
  }
  const fragments = _strFragments( null, cc, replacer );
  const r = fragsToStr( fragments, 0, 0 );
  return r;
}

function _handler( alts ) {
  const { head: headAlts, params } = alts;
  return match( headAlts, {
    'expression': ( e ) => ( { head: clauseFromAlts( e ), params } ),
    'altNode': ( { enclosed } ) =>
      match( enclosed, {
        'sExpression': _handler,
      }, () => {} )
  }, () => {
    throw '3';
  } )
}

function _expand( currCase, pivot ) {
  if ( C.isValid( PartialableSExprClause, currCase ) ) {
    let [ head, ...params ] = currCase;
    if ( head === pivot ) {
      let altCases = _makeAlts( head, params );
      return { found: true, cases: altCases };
    } else {
      for ( let i = 0; i < params.length; i += 1 ) {
        let { found, cases } = _expand( params[ i ], pivot );
        if ( found ) {
          return {
            found,
            cases: cases.map( ( c ) => _makeAltCase( c, currCase, i ) )
          };
        }
      }
    }
  }

  if ( currCase[ 0 ] instanceof AltHeadNode ) {
    let [ { enclosed, label, clause } ] = currCase;
    for ( let i = 0; i < enclosed.length; i += 1 ) {
      let { found, cases } = _expand( enclosed[ i ], pivot );
      if ( found ) {
        return {
          found,
          cases: cases.map( ( c ) =>
            [ new AltHeadNode( label, clause, _makeAltCase( c, enclosed, i - 1 ) ) ] )
        };
      }
    }
  }

  if (
    currCase instanceof QuotedParamsMap ||
    currCase instanceof UnquotedParamsMap ) {
    for ( let key in currCase ) {
      if ( currCase.hasOwnProperty( key ) ) {
        let val = currCase[ key ];
        let { found, cases } = _expand( val, pivot );
        if ( found ) {
          return {
            found,
            cases: cases.map( ( c ) =>
              _makeAltCaseMap( c, currCase, key ) )
          };
        }
      }
    }
  }
  return { found: false, cases: [ currCase ] };

}

function _makeAlts( pivot, params ) {
  if ( pivot.opts.named ) {
    return pivot.exprs.map( ( { name, expr }, idx ) =>
      [ new AltHeadNode( name, pivot, params[ idx * 2 + 1 ] ) ] );
  } else {
    return pivot.exprs.map( ( e, idx ) =>
      [ new AltHeadNode( null, pivot, params[ idx ] ) ] );
  }
}


function _makeAltCase( item, sExpression, posInParam ) {
  return sExpression.slice( 0, posInParam + 1 )
    .concat( [ item ] )
    .concat( sExpression.slice( posInParam + 2 ) );
}

function _makeAltCaseMap( item, map, key ) {
  let r;
  if ( map instanceof QuotedParamsMap ) {
    r = new QuotedParamsMap();
  } else if ( map instanceof UnquotedParamsMap ) {
    r = new UnquotedParamsMap();
  }

  oAssign( r, map );
  r[ key ] = item;
  return r;
}

function _fold(
  reducer, { sExpression, quotedParamsMap, unquotedParamsMap },
  init,
  replacer,
  inFclause ) {
  let r = init;

  if ( sExpression ) {
    let { head: headAlts, params: { labelled, unlabelled } = {} } = sExpression;
    const head = clauseFromAlts( headAlts );
    var replaced;
    if ( replacer ) {
      replaced = replacer( head );
      if ( replaced ) {
        return r;
      }
    }
    r = reducer( r, head );

    const items = labelled || unlabelled || [];
    r = items.reduce(
    ( acc, { item } ) => {
      if ( head.type === 'FCLAUSE' ) {
        return _fold( reducer, item, acc, replacer, true )
      } else {
        return _fold( reducer, item, acc, replacer )
      }
    }
  , r );
  } else if ( quotedParamsMap || unquotedParamsMap ) {
    let m = quotedParamsMap || unquotedParamsMap;
    for ( let key in m ) {
      if ( m.hasOwnProperty( key ) ) {
        if ( !( inFclause && unquotedParamsMap && key === 'ret' ) ) {
          let { singleParam } = m[ key ];
          if ( singleParam ) {
            r = _fold( reducer, singleParam, r, replacer, inFclause );
          }
        }
      }
    }
  }
  return r;
}

// A "pivot" is an "or" clause
function _findPivots( cSExpr, replacer ) {
  return _fold( ( acc, item ) => {
    if ( _isPivot( item ) && acc.indexOf( item ) < 0 ) {
      return acc.concat( [ item ] );
    } else {
      return acc;
    }
  }, cSExpr, [], replacer );
}

function _isPivot( expr ) {
  return expr.type === 'OR';
}

export default synopsis;

// // //


// var SampleClause = cat(
//   'first', oneOrMore( cat( isStr, isBool ) ),
//   'second', or(
//     'objOpt', isObj,
//     'showNum', cat( isNum, or( isBool, isObj, isFinite ) )
//   ),
//   'third', shape( {
//     required: {
//       'qw': or( isNum, isObj )
//     }
//   } )
//   );

// var SampleFnClause = fclause( {
//   args: SampleClause
// } );

// import { TestClause } from '../core/regex';

// var r = synopsis( TestClause );
// console.log( r );
