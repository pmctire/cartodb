var Backbone = require('backbone');
var UsersGroup = require('./users-group-collection');

/**
 * Model representing a group.
 * Expected to be used in the context of a groups collection (e.g. OrganizationGroups),
 * which defines its API endpoint path.
 */

module.exports = Backbone.Model.extend({

  defaults: {
    display_name: ''
  },

  initialize: function (attrs) {
    this.parse(attrs || {}); // handle given attrs in the same way as for .fetch()
  },

  parse: function (attrs) {
    this.users = new UsersGroup(attrs.users, {
      group: this
    });

    return attrs;
  }
});