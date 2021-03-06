import './setup';
import sinon from 'sinon';
import expect from 'expect';
import { STORAGE_KEY } from '../src/constants';
import createOidcMiddleware, { getUserSuccessCallback, getUserErrorCallback, setStoredUser, removeStoredUser, storedUser } from '../src/oidcMiddleware';
import { userExpired, userFound } from '../src/actions';

describe('createOidcMiddleware()', () => {
  let userManagerMock;
  let windowMock;
  let oldWindow;
  let localStorageMock;
  let oldStorage;
  let setItemStub;
  let getItemStub;
  let removeItemStub;
  let getUserStub;
  let signinRedirectStub;
  let thenStub;
  let catchStub;
  let nextStub;
  let storeMock;
  let getStateStub;
  let action;
  let stateMock;
  let href = 'http://some.url.com';

  beforeEach(() => {
    windowMock = {
      location: { href }
    };
    oldWindow = window;
    window = windowMock;

    setItemStub = sinon.stub();
    getItemStub = sinon.stub();
    removeItemStub = sinon.stub();
    localStorageMock = {
      setItem: setItemStub,
      getItem: getItemStub,
      removeItem: removeItemStub
    };
    oldStorage = localStorage;
    localStorage = localStorageMock;

    catchStub = sinon.stub();

    thenStub = sinon.stub().returns({
      catch: catchStub
    });

    getUserStub = sinon.stub().returns({
      then: thenStub
    });

    signinRedirectStub = sinon.stub();

    userManagerMock = {
      getUser: getUserStub,
      signinRedirect: signinRedirectStub
    };

    stateMock = { some: 'state' };
    getStateStub = sinon.stub().returns(stateMock);

    storeMock = {
      getState: getStateStub
    };

    action = {
      type: 'SOME_ACTION'
    };

    nextStub = sinon.stub().returns(action);
  });

  afterEach(() => {
    window = oldWindow;
    localStorage = oldStorage;
    removeStoredUser();
  });

  it('should return the correct middleware function', () => {
    const middleware = createOidcMiddleware(userManagerMock);

    expect(typeof(middleware)).toEqual('function');
    expect(middleware.length).toEqual(1);

    let nextFunction = middleware(storeMock);
    expect(typeof(nextFunction)).toEqual('function');
    expect(nextFunction.length).toEqual(1);

    nextFunction = nextFunction(nextStub);
    expect(typeof(nextFunction)).toEqual('function');
    expect(nextFunction.length).toEqual(1);
  });

  it('should call the shouldValidate() function with the redux state and dispatched action', () => {
    const shouldValidate = sinon.stub();
    createOidcMiddleware(userManagerMock, shouldValidate)(storeMock)(nextStub)(action);

    expect(getStateStub.called).toEqual(true);
    expect(shouldValidate.calledWith(stateMock, action)).toEqual(true);
  });

  it('should trigger the validation when shouldValidate() returns true', () => {
    const shouldValidate = sinon.stub().returns(true);
    const result = createOidcMiddleware(userManagerMock, shouldValidate)(storeMock)(nextStub)(action);

    expect(setItemStub.calledWith(STORAGE_KEY, true)).toEqual(true);
    expect(getUserStub.called).toEqual(true);
    expect(thenStub.called).toEqual(true);
    expect(catchStub.calledWith(getUserErrorCallback)).toEqual(true);
  });

  it('should not trigger the validation when shouldValidate() returns false', () => {
    const shouldValidate = sinon.stub().returns(false);
    createOidcMiddleware(userManagerMock, shouldValidate)(storeMock)(nextStub)(action);

    expect(setItemStub.called).toEqual(false);
    expect(getUserStub.called).toEqual(false);
    expect(thenStub.called).toEqual(false);
    expect(catchStub.called).toEqual(false);
  });

  it('should not trigger validation when the local storage key is set', () => {
    const shouldValidate = sinon.stub().returns(true);
    getItemStub.returns(true);
    const result = createOidcMiddleware(userManagerMock, shouldValidate)(storeMock)(nextStub)(action);

    expect(setItemStub.called).toEqual(false);
    expect(getUserStub.called).toEqual(false);
    expect(thenStub.called).toEqual(false);
    expect(catchStub.called).toEqual(false);
    expect(nextStub.calledWith(action)).toEqual(true);
    expect(result).toEqual(action);
  });

  it('should not call localStorage and getUser() when the storedUser has been set', () => {
    setStoredUser({ some: 'user' });
    const shouldValidate = sinon.stub().returns(true);

    const result = createOidcMiddleware(userManagerMock, shouldValidate)(storeMock)(nextStub)(action);
    expect(setItemStub.called).toEqual(false);
    expect(getUserStub.called).toEqual(false);
    expect(thenStub.called).toEqual(false);
    expect(catchStub.called).toEqual(false);
    expect(nextStub.calledWith(action)).toEqual(true);
    expect(result).toEqual(action);
  });

  it('should call localStorage and getUser() when the storedUser is expired', () => {
    setStoredUser({ expired: true });
    const shouldValidate = sinon.stub().returns(true);

    const result = createOidcMiddleware(userManagerMock, shouldValidate)(storeMock)(nextStub)(action);
    expect(setItemStub.called).toEqual(true);
    expect(getUserStub.called).toEqual(true);
    expect(thenStub.called).toEqual(true);
    expect(catchStub.called).toEqual(true);
    expect(nextStub.calledWith(action)).toEqual(false);
  });

  it('getUserSuccessCallback - should handle an expired user correctly', () => {
    const user = null;
    const result = getUserSuccessCallback(nextStub, userManagerMock, user, false, action);

    expect(nextStub.calledWith(userExpired())).toEqual(true);
    expect(nextStub.calledWith(action)).toEqual(true);
    expect(result).toEqual(action);
  });

  it('getUserSuccessCallback - should trigger the redirect when triggerAuthFlow is true', () => {
    const user = null;
    const result = getUserSuccessCallback(nextStub, userManagerMock, user, true, action);
    const stateData = {
      data: {
        redirectUrl: href
      }
    };

    expect(signinRedirectStub.calledWith(stateData)).toEqual(true);
    expect(nextStub.calledWith(userExpired())).toEqual(true);
    expect(nextStub.calledWith(action)).toEqual(false);
    expect(result).toEqual(undefined);
  });

  it('getUserSuccessCallback - should not trigger the redirect when triggerAuthFlow is false', () => {
    const user = null;
    const result = getUserSuccessCallback(nextStub, userManagerMock, user, false, action);

    expect(signinRedirectStub.called).toEqual(false);
    expect(nextStub.calledWith(userExpired())).toEqual(true);
    expect(nextStub.calledWith(action)).toEqual(true);
    expect(result).toEqual(action);
  });

  it('getUserSuccessCallback - should handle a valid user correctly', () => {
    const user = { some: 'user' };
    const result = getUserSuccessCallback(nextStub, userManagerMock, user, false, action);

    expect(signinRedirectStub.called).toEqual(false);
    expect(removeItemStub.calledWith(STORAGE_KEY)).toEqual(true);
    expect(nextStub.calledWith(userFound(user))).toEqual(true);
    expect(nextStub.calledWith(action)).toEqual(true);
    expect(storedUser).toEqual(user);
    expect(result).toEqual(action);
  });

  it('getUserErrorCallback - should handle callback errors correctly', () => {
    const error = { message: 'error' };

    expect(() => getUserErrorCallback(error)).toThrow(/error/);
    expect(removeItemStub.calledWith(STORAGE_KEY)).toEqual(true);
  });
});
