'use strict';

/* global OAuthSchemeKeys */
/* global redirect_uri */
/* global clientId */
/* global scopeSeparator */
/* global additionalQueryStringParams */
/* global clientSecret */
/* global onOAuthComplete */
/* global OAuthSchemeKeys */
/* global realm */
/*jshint unused:false*/

SwaggerUi.Views.AuthView = Backbone.View.extend({
    events: {
        'click .auth_submit__button': 'authorizeClick',
        'click .auth_logout__button': 'logoutClick'
    },

    tpls: {
        main: Handlebars.templates.auth_view
    },

    selectors: {
        innerEl: '.auth_inner'
    },

    initialize: function(opts) {
        this.options = opts || {};
        opts.data = opts.data || {};
        this.router = this.options.router;

        this.collection = new SwaggerUi.Collections.AuthsCollection();
        this.collection.add(this.parseData(opts.data));

        this.$el.html(this.tpls.main({
            isLogout: this.collection.isAuthorized(),
            isAuthorized: this.collection.isPartiallyAuthorized()
        }));
        this.$innerEl = this.$(this.selectors.innerEl);
    },

    render: function () {
        this.renderAuths();

        if (!this.$innerEl.html()) {
            this.$el.html('');
        }

        return this;
    },

    authorizeClick: function (e) {
        e.preventDefault();
        e.stopPropagation();

        if (this.collection.isValid()) {
            this.authorize();
        }
    },

    parseData: function (data) {
        var authz = Object.assign({}, window.swaggerUi.api.clientAuthorizations.authz);

        return _.map(data, function (auth, name) {
            var isBasic = authz.basic && auth.type === 'basic';

            _.extend(auth, {
                title: name
            });

            if (authz[name] || isBasic) {
                _.extend(auth, {
                    isLogout: true,
                    value: isBasic ? undefined : authz[name].value,
                    username: isBasic ? authz.basic.username : undefined,
                    password: isBasic ? authz.basic.password : undefined,
                    valid: true
                });
            }

            return auth;
        });
    },

    renderAuths: function () {
        this.collection.each(function (auth) {
            this.renderOneAuth(auth);
        }, this);
    },

    renderOneAuth: function (authModel) {
        var authEl;
        var type = authModel.get('type');

        //todo refactor move view name into var and call new with it.
        if (type === 'apiKey') {
            authEl = new SwaggerUi.Views.ApiKeyAuthView({model: authModel, router: this.router}).render().el;
        } else if (type === 'basic' && this.$innerEl.find('.basic_auth_container').length === 0) {
            authEl = new SwaggerUi.Views.BasicAuthView({model: authModel, router: this.router}).render().el;
        } else if (type === 'oauth2') {
            authEl = new SwaggerUi.Views.Oauth2View({model: authModel, router: this.router}).render().el;
        }

        this.$innerEl.append(authEl);
    },

    authorize: function () {
        this.collection.forEach(function (auth) {
            var keyAuth, basicAuth;
            var type = auth.get('type');

            if (type === 'apiKey') {
                keyAuth = new SwaggerClient.ApiKeyAuthorization(
                    auth.get('name'),
                    auth.get('value'),
                    auth.get('in')
                );

                this.router.api.clientAuthorizations.add(auth.get('title'), keyAuth);
            } else if (type === 'basic') {
                basicAuth = new SwaggerClient.PasswordAuthorization(auth.get('username'), auth.get('password'));
                this.router.api.clientAuthorizations.add(auth.get('type'), basicAuth);
            } else if (type === 'oauth2') {
                this.handleOauth2Login(auth);
            }
        }, this);

        this.router.load();
    },

    logoutClick: function (e) {
        e.preventDefault();

        this.collection.forEach(function (auth) {
            var name = auth.get('type') === 'basic' ? 'basic' : auth.get('title');

            window.swaggerUi.api.clientAuthorizations.remove(name);
        });

        this.router.load();
    },

    // taken from lib/swagger-oauth.js
    handleOauth2Login: function (auth) {
        var host = window.location;
        var pathname = location.pathname.substring(0, location.pathname.lastIndexOf('/'));
        var defaultRedirectUrl = host.protocol + '//' + host.host + pathname + '/o2c.html';
        var redirectUrl = window.oAuthRedirectUrl || defaultRedirectUrl;
        var url = null;
        var scopes = _.map(auth.get('scopes'), function (scope) {
            return scope.scope;
        });
        var OAuthSchemeKeys = [];
        var state, dets, ep;

        window.enabledScopes = scopes;
        var flow = auth.get('flow');

        if(auth.get('type') === 'oauth2' && flow && (flow === 'implicit' || flow === 'accessCode')) {
            dets = auth.attributes;
            url = dets.authorizationUrl + '?response_type=' + (flow === 'implicit' ? 'token' : 'code');
            window.swaggerUi.tokenName = dets.tokenName || 'access_token';
            window.swaggerUi.tokenUrl = (flow === 'accessCode' ? dets.tokenUrl : null);
            //state = key;
        }
        else if(auth.get('type') === 'oauth2' && flow && (flow === 'application')) {
            dets = auth.attributes;
            window.swaggerUi.tokenName = dets.tokenName || 'access_token';
            this.clientCredentialsFlow(scopes, dets.tokenUrl, '');
            return;
        }
        else if(auth.get('grantTypes')) {
            // 1.2 support
            var o = auth.get('grantTypes');
            for(var t in o) {
                if(o.hasOwnProperty(t) && t === 'implicit') {
                    dets = o[t];
                    ep = dets.loginEndpoint.url;
                    url = dets.loginEndpoint.url + '?response_type=token';
                    window.swaggerUi.tokenName = dets.tokenName;
                }
                else if (o.hasOwnProperty(t) && t === 'accessCode') {
                    dets = o[t];
                    ep = dets.tokenRequestEndpoint.url;
                    url = dets.tokenRequestEndpoint.url + '?response_type=code';
                    window.swaggerUi.tokenName = dets.tokenName;
                }
            }
        }

        var redirect_uri = redirectUrl;

        url += '&redirect_uri=' + encodeURIComponent(redirectUrl);
        url += '&realm=' + encodeURIComponent(realm);
        url += '&client_id=' + encodeURIComponent(clientId);
        url += '&scope=' + encodeURIComponent(scopes.join(scopeSeparator));
        url += '&state=' + encodeURIComponent(state);
        for (var key in additionalQueryStringParams) {
            url += '&' + key + '=' + encodeURIComponent(additionalQueryStringParams[key]);
        }

        window.open(url);
    },

    // taken from lib/swagger-oauth.js
    clientCredentialsFlow: function (scopes, tokenUrl, OAuthSchemeKey) {
        var params = {
            'client_id': clientId,
            'client_secret': clientSecret,
            'scope': scopes.join(' '),
            'grant_type': 'client_credentials'
        };
        $.ajax({
            url : tokenUrl,
            type: 'POST',
            data: params,
            success: function (data)
            {
                onOAuthComplete(data, OAuthSchemeKey);
            },
            error: function ()
            {
                onOAuthComplete('');
            }
        });
    }

});
