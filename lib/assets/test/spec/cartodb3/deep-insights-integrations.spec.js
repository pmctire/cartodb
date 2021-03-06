var $ = require('jquery');
var _ = require('underscore');
var Backbone = require('backbone');
var ConfigModel = require('../../../javascripts/cartodb3/data/config-model');
var deepInsights = require('cartodb-deep-insights.js');
var AnalysisDefinitionNodesCollection = require('../../../javascripts/cartodb3/data/analysis-definition-nodes-collection');
var AnalysisDefinitionsCollection = require('../../../javascripts/cartodb3/data/analysis-definitions-collection');
var DeepInsightsIntegrations = require('../../../javascripts/cartodb3/deep-insights-integrations');
var LayerDefinitionsCollection = require('../../../javascripts/cartodb3/data/layer-definitions-collection');
var VisDefinitionModel = require('../../../javascripts/cartodb3/data/vis-definition-model');

var createOnboardings = function () {
  return {
    create: function () {
      return {};
    }
  };
};
var createFakeDashboard = function (layers) {
  var allLayersHaveIds = _.all(layers, function (layer) {
    return layer.get('id');
  });
  if (!allLayersHaveIds) {
    throw new Error('all layers in createFakeDashboard need to have an id');
  }

  var fakeMap = new Backbone.Model();
  fakeMap.getLayerById = function (layerId) {
    return _.find(layers, function (layer) {
      return layer.get('id') === layerId;
    });
  };
  var fakeVis = new Backbone.Model();
  fakeVis.map = fakeMap;

  return {
    getMap: function () {
      return fakeVis;
    }
  };
};

var createFakeLayer = function (attrs) {
  var layer = new Backbone.Model(attrs);
  layer.isVisible = function () { return true; };
  return layer;
};

describe('deep-insights-integrations', function () {
  beforeEach(function (done) {
    var configModel = new ConfigModel({
      base_url: 'pepito'
    });
    this.el = document.createElement('div');
    this.el.id = 'wdmtmp';
    document.body.appendChild(this.el);
    var vizjson = {
      bounds: [[24.206889622398023, -84.0234375], [76.9206135182968, 169.1015625]],
      center: '[41.40578459184651, 2.2230148315429688]',
      user: {},
      datasource: {
        maps_api_template: 'asd',
        user_name: 'pepe'
      },
      layers: [{
        id: 'l-1',
        kind: 'carto',
        type: 'CartoDB'
      }],
      widgets: []
    };

    spyOn($, 'ajax').and.callFake(function (options) {
      options.success({
        layergroupid: '123456789',
        metadata: {
          layers: []
        }
      });
    });

    deepInsights.createDashboard('#wdmtmp', vizjson, {}, function (error, dashboard) {
      if (error) {
        throw new Error('error creating dashboard ' + error);
      }
      this.dashboard = dashboard;
      this.analysis = this.dashboard.getMap().analysis;
      spyOn(this.analysis, 'analyse').and.callThrough();

      this.visDefinitionModel = new VisDefinitionModel({
        name: 'Foo Map',
        privacy: 'PUBLIC',
        updated_at: '2016-06-21T15:30:06+00:00',
        type: 'derived'
      }, {
        configModel: configModel
      });

      this.analysisDefinitionNodesCollection = new AnalysisDefinitionNodesCollection(null, {
        configModel: configModel
      });
      this.analysisDefinitionsCollection = new AnalysisDefinitionsCollection(null, {
        configModel: configModel,
        analysisDefinitionNodesCollection: this.analysisDefinitionNodesCollection,
        vizId: 'v-123'
      });

      this.layerDefinitionsCollection = new LayerDefinitionsCollection(null, {
        configModel: configModel,
        analysisDefinitionNodesCollection: this.analysisDefinitionNodesCollection,
        mapId: 'map-123'
      });
      this.widgetDefinitionsCollection = new Backbone.Collection();

      this.integrations = new DeepInsightsIntegrations({
        userModel: new Backbone.Model(),
        onboardings: createOnboardings(),
        deepInsightsDashboard: dashboard,
        analysisDefinitionsCollection: this.analysisDefinitionsCollection,
        analysisDefinitionNodesCollection: this.analysisDefinitionNodesCollection,
        layerDefinitionsCollection: this.layerDefinitionsCollection,
        widgetDefinitionsCollection: this.widgetDefinitionsCollection,
        visDefinitionModel: this.visDefinitionModel
      });

      done();
    }.bind(this));
  });

  afterEach(function () {
    document.body.removeChild(this.el);
  });

  describe('when a widget-definition is created', function () {
    beforeEach(function () {
      spyOn(this.dashboard, 'createFormulaWidget').and.callThrough();
      this.model = this.widgetDefinitionsCollection.add({
        id: 'w-100',
        type: 'formula',
        title: 'avg of something',
        layer_id: 'l-1',
        column: 'col',
        operation: 'avg',
        source: 'a0'
      });
      this.model.trigger('sync', this.model);
    });

    afterEach(function () {
      // delete widget after test case
      this.widgetModel = this.dashboard.getWidget(this.model.id);
      spyOn(this.widgetModel, 'remove').and.callThrough();

      // Fake deletion
      this.model.trigger('destroy', this.model);
      expect(this.widgetModel.remove).toHaveBeenCalled();
    });

    it('should create the corresponding widget model for the dashboard', function () {
      expect(this.dashboard.createFormulaWidget).toHaveBeenCalled();

      var args = this.dashboard.createFormulaWidget.calls.argsFor(0);
      expect(args[0]).toEqual(jasmine.objectContaining({
        title: 'avg of something',
        layer_id: 'l-1',
        column: 'col',
        operation: 'avg',
        source: {id: 'a0'}
      }));
      expect(args[1]).toBe(this.integrations.visMap().layers.first());
    });

    it('should enable show_stats for the created widget model', function () {
      var widgetModel = this.dashboard.getWidget(this.model.id);
      expect(widgetModel.get('show_stats')).toBeTruthy();
    });

    describe('when definition changes data', function () {
      beforeEach(function () {
        this.widgetModel = this.dashboard.getWidget(this.model.id);
        spyOn(this.widgetModel, 'update').and.callThrough();
      });

      describe('of any normal param', function () {
        beforeEach(function () {
          this.model.set('operation', 'max');
        });

        it('should update the corresponding widget model', function () {
          expect(this.widgetModel.update).toHaveBeenCalled();
          expect(this.widgetModel.update).toHaveBeenCalledWith({ operation: 'max' });
        });
      });

      describe('of the source', function () {
        beforeEach(function () {
          this.model.set({
            operation: 'max',
            source: 'a1'
          });
        });

        it('should maintain normal params but massage the source', function () {
          expect(this.widgetModel.update).toHaveBeenCalled();
          expect(this.widgetModel.update).toHaveBeenCalledWith({
            operation: 'max',
            source: {id: 'a1'}
          });
        });
      });
    });

    describe('when definition changes type', function () {
      beforeEach(function () {
        this.widgetModel = this.dashboard.getWidget(this.model.id);
        spyOn(this.widgetModel, 'remove').and.callThrough();
        spyOn(this.dashboard, 'createCategoryWidget').and.callThrough();

        this.model.set('type', 'category');
      });

      it('should remove the corresponding widget model', function () {
        expect(this.widgetModel.remove).toHaveBeenCalled();
      });

      describe('should create a new widget model for the type', function () {
        beforeEach(function () {
          expect(this.dashboard.createCategoryWidget).toHaveBeenCalled();
          // Same ceation flow as previously tested, so don't test more into detail for now
          expect(this.dashboard.createCategoryWidget).toHaveBeenCalledWith(jasmine.any(Object), jasmine.any(Object));
        });

        it('with new attrs', function () {
          expect(this.dashboard.createCategoryWidget.calls.argsFor(0)[0]).toEqual(
            jasmine.objectContaining({
              id: 'w-100',
              type: 'category',
              source: {id: 'a0'}
            })
          );
        });

        it('with prev layer-defintion', function () {
          expect(this.dashboard.createCategoryWidget.calls.argsFor(0)[1].id).toEqual('l-1');
        });
      });

      it('should set show_stats in the new widget model', function () {
        var widgetModel = this.dashboard.getWidget(this.model.id);
        expect(widgetModel.get('show_stats')).toBeTruthy();
      });
    });
  });

  describe('when a new layer is created', function () {
    beforeEach(function () {
      this.layerDefinitionModel = this.layerDefinitionsCollection.add({
        id: 'integration-test',
        kind: 'background',
        options: {
          color: 'blue'
        }
      });
    });

    it('should have created the layer', function () {
      var l = this.integrations.visMap().layers.get(this.layerDefinitionModel.id);
      expect(l).toBeDefined();
      expect(l.get('color')).toEqual('blue');
      expect(l.get('type')).toEqual('Plain');
      expect(l.get('order')).toEqual(0);
    });

    it('should insert the layer at the given position (order)', function () {
      this.layerDefinitionModel = this.layerDefinitionsCollection.add({
        id: 'integration-test-2',
        kind: 'carto',
        options: {
          sql: 'SELECT * FROM foo',
          cartocss: '...'
        }
      }, { at: 1 }); // <- this is what actually determines the right order

      expect(this.layerDefinitionModel.get('order')).toEqual(1);

      var l = this.integrations.visMap().layers.get(this.layerDefinitionModel.id);
      expect(this.integrations.visMap().layers.indexOf(l)).toEqual(1);
      expect(l.get('order')).toEqual(1);

      this.layerDefinitionModel = this.layerDefinitionsCollection.add({
        id: 'integration-test-3',
        kind: 'carto',
        options: {
          sql: 'SELECT * FROM foo',
          cartocss: '...'
        }
      }, { at: 2 }); // <- this is what actually determines the right order

      expect(this.layerDefinitionModel.get('order')).toEqual(2);

      l = this.integrations.visMap().layers.get(this.layerDefinitionModel.id);
      expect(this.integrations.visMap().layers.indexOf(l)).toEqual(2);
      expect(l.get('order')).toEqual(2);
    });

    describe('when update some layer attrs', function () {
      beforeEach(function () {
        this.layerDefinitionModel.set({
          color: 'pink',
          letter: 'c'
        });
      });

      it('should update the equivalent layer', function () {
        var l = this.integrations.visMap().layers.get(this.layerDefinitionModel.id);
        expect(l.get('color')).toEqual('pink');
      });
    });

    describe('when update layer includes change of type', function () {
      beforeEach(function () {
        this.layerBefore = this.integrations.visMap().layers.get(this.layerDefinitionModel.id);
        this.layerDefinitionModel.set({
          type: 'CartoDB',
          table_name: 'my_table',
          cartocss: 'asd',
          sql: 'SELECT * FROM my_table'
        });
        this.layerAfter = this.integrations.visMap().layers.get(this.layerDefinitionModel.id);
      });

      it('should have re-created layer', function () {
        expect(this.layerAfter).not.toBe(this.layerBefore);
        expect(this.layerAfter.get('sql')).toEqual('SELECT * FROM my_table');
        expect(this.layerAfter.get('type')).toEqual('CartoDB');
      });
    });

    describe('when layer type is changed to torque', function () {
      beforeEach(function () {
        this.layerBefore = this.integrations.visMap().layers.get(this.layerDefinitionModel.id);
        spyOn(this.integrations, '_getLayer');
        this.layerDefinitionModel.set({
          type: 'CartoDB',
          table_name: 'my_table',
          cartocss: 'asd',
          sql: 'SELECT * FROM my_table'
        });
        this.layerDefinitionModel.attributes.type = 'torque'; // setting it like this so that it doesn't trigger any events
        this.layerAfter = this.integrations.visMap().layers.get(this.layerDefinitionModel.id);
      });

      it('should have fetched re-created layer to make new timeseries widget model', function () {
        expect(this.integrations._getLayer).toHaveBeenCalled();
      });

      xit("should a timeslider widget if there wasn't one", function () {
        expect(this.widgetDefinitionsCollection.where({'type': 'time-series'}).length).not.toBeLessThan(1);
      });
    });

    describe('when layer has a source attribute here and not in CartoDB.js', function () {
      xit('should set/update the source attribute', function () {
        // Simulate what deep-insight.js/CartoDB.js does internally to reset the layers (eg: when
        // creating a dashboard from a viz.json file using createDashboard) right after a map has been
        // created. Notice that layers don't have a source attribute in these cases.
        this.integrations.visMap().layers.reset({
          'id': 'LAYER_ID',
          'type': 'CartoDB',
          'order': 1,
          'visible': true,
          'options': {
            'cartocss': 'cartoCSS',
            'cartocss_version': '2.1.1',
            'sql': 'SELECT * FROM test'
          }
        });

        this.layerDefinitionModel = this.layerDefinitionsCollection.add({
          id: 'LAYER_ID',
          kind: 'carto',
          options: {
            sql: 'SELECT * FROM test',
            cartocss: 'cartoCSS',
            table_name: 'infowindow_stuff'
          }
        });
        expect(this.layerDefinitionModel.get('source')).not.toBeUndefined();

        // Layer at the CartoDB.js level doesn't have a "source"
        this.layerBefore = this.integrations.visMap().layers.get(this.layerDefinitionModel.id);
        expect(this.layerBefore.get('source')).toBeUndefined();

        // Change some attributes
        this.layerDefinitionModel.set({
          cartocss: 'a different CartoCSS'
        });

        // Layer in CartoDB.js now has the corresponding "source" attribute
        this.layerAfter = this.integrations.visMap().layers.get(this.layerDefinitionModel.id);
        expect(this.layerAfter.get('source')).toEqual(this.layerDefinitionModel.get('source'));
      });
    });

    describe('when removing layer', function () {
      beforeEach(function () {
        this.layerDefinitionsCollection.remove(this.layerDefinitionModel);
      });

      it('should no longer be accessible', function () {
        expect(this.integrations.visMap().layers.get(this.layerDefinitionModel.id)).toBeUndefined();
      });
    });
  });

  describe('when the style is changed', function () {
    it("should disable any activated widgets' autoStyle", function () {
      var layerDefinitionModel = this.layerDefinitionsCollection.add({
        id: 'integration-test',
        kind: 'carto',
        options: {
          table_name: 'something',
          source: 'a0',
          cartocss: ''
        }
      });
      var model = this.widgetDefinitionsCollection.add({
        id: 'w-100',
        type: 'category',
        title: 'test',
        layer_id: 'integration-test',
        column: 'col',
        source: 'a0'
      });
      model.trigger('sync', model);
      var widgetModel = this.dashboard.getWidgets()[0];
      widgetModel.set('autoStyle', true);
      layerDefinitionModel.set('cartocss', 'differentCartocss');
      document.body.removeChild(document.getElementsByClassName('CDB-Widget-tooltip')[0]);
      expect(widgetModel.get('autoStyle')).toBe(false);
    });
  });

  describe('when analysis-definition-node is created', function () {
    beforeEach(function () {
      this.a0 = this.analysisDefinitionNodesCollection.add({
        id: 'a0',
        type: 'source',
        params: {
          query: 'SELECT * FROM foobar'
        }
      });
    });

    it('should analyse node', function () {
      expect(this.analysis.analyse).toHaveBeenCalledWith({
        id: 'a0',
        type: 'source',
        params: {
          query: 'SELECT * FROM foobar'
        }
      });
    });

    describe('when changed', function () {
      beforeEach(function () {
        this.analysis.analyse.calls.reset();
        this.a0.set('query', 'SELECT * FROM foobar LIMIT 10');
      });

      it('should analyse node again but with changed query', function () {
        expect(this.analysis.analyse).toHaveBeenCalled();
        expect(this.analysis.analyse).toHaveBeenCalledWith(
          jasmine.objectContaining({
            params: {
              query: 'SELECT * FROM foobar LIMIT 10'
            }
          })
        );
      });
    });

    describe('when an analysis-definition is added for source node', function () {
      beforeEach(function () {
        spyOn(this.a0.querySchemaModel, 'set');
        this.analysisDefinitionsCollection.add({analysis_definition: this.a0.toJSON()});
      });

      it('should setup query schema model of node-definition', function () {
        expect(this.a0.querySchemaModel.get('query')).toEqual('SELECT * FROM foobar');
        expect(this.a0.querySchemaModel.get('ready')).toBe(true);
      });

      describe('when analysis node has finished executing', function () {
        beforeEach(function () {
          this.analysis.findNodeById('a0').set('status', 'ready');
        });

        it('should not affect the query-schema-model if its a source', function () {
          expect(this.a0.querySchemaModel.set).not.toHaveBeenCalled();
        });
      });

      describe('when analysis-definition-node is removed', function () {
        beforeEach(function () {
          expect(this.analysis.findNodeById('a0')).toBeDefined();
          this.analysisDefinitionNodesCollection.remove(this.a0);
        });

        it('should remove node', function () {
          expect(this.analysis.findNodeById('a0')).toBeUndefined();
        });
      });
    });

    describe('when an analysis definition is added for non-source node', function () {
      beforeEach(function () {
        this.analysisDefinitionsCollection.add({
          analysis_definition: {
            id: 'a1',
            type: 'buffer',
            params: {
              radius: 10,
              source: this.a0.toJSON()
            }
          }
        });
        this.a1 = this.analysisDefinitionNodesCollection.get('a1');
      });

      it('should setup query schema model of node-definition', function () {
        expect(this.a1.querySchemaModel.get('query')).toEqual(undefined);
        expect(this.a1.querySchemaModel.get('ready')).toBe(false);
      });

      describe('when analysis node has finished executing', function () {
        beforeEach(function () {
          this.analysis.findNodeById('a1').set({
            query: 'SELECT buffer FROM tmp_result_table_123',
            status: 'ready'
          });
        });

        it('should update the query-schema-model', function () {
          expect(this.a1.querySchemaModel.get('query')).toEqual('SELECT buffer FROM tmp_result_table_123');
          expect(this.a1.querySchemaModel.get('ready')).toBe(true);
        });
      });
    });
  });

  describe('when a layer is moved', function () {
    beforeEach(function () {
      this.newLayer = this.layerDefinitionsCollection.add({
        id: 'hello',
        kind: 'carto',
        options: {
          table_name: 'something',
          source: 'a0',
          cartocss: ''
        }
      });
    });

    it('should remove model and create a new one with the same id', function () {
      var currentModel = this.integrations._getLayer(this.newLayer);
      this.layerDefinitionsCollection.trigger('layerMoved', this.newLayer);
      var newModel = this.integrations._getLayer(this.newLayer);
      expect(newModel.cid).not.toBe(currentModel.cid);
      expect(newModel.attributes.source).toEqual('a0');
    });
  });

  describe('when vis reloads', function () {
    it('should increment changes', function () {
      this.integrations._vis().trigger('reload');
      expect(this.visDefinitionModel.get('visChanges')).toBe(1);
    });
  });

  describe('.infowindow', function () {
    beforeEach(function () {
      this.cdbLayer = createFakeLayer({ id: 'layer-id' });
      this.cdbLayer.infowindow = jasmine.createSpyObj('infowindow', ['update']);

      this.layerDefinitionsCollection.resetByLayersData({
        id: 'layer-id',
        kind: 'carto',
        options: {
          table_name: 'infowindow_stuff',
          cartocss: ''
        },
        infowindow: {
          alternative_names: {},
          autoPan: true,
          content: '',
          fields: [],
          headerColor: {},
          latlng: [0, 0],
          maxHeight: 180,
          offset: [28, 0],
          template: '',
          template_name: 'table/views/infowindow_light',
          visibility: false,
          width: 226
        }
      });

      this.integrations2 = new DeepInsightsIntegrations({
        userModel: new Backbone.Model(),
        onboardings: createOnboardings(),
        deepInsightsDashboard: createFakeDashboard([ this.cdbLayer ]),
        analysisDefinitionsCollection: this.analysisDefinitionsCollection,
        analysisDefinitionNodesCollection: this.analysisDefinitionNodesCollection,
        layerDefinitionsCollection: this.layerDefinitionsCollection,
        widgetDefinitionsCollection: this.widgetDefinitionsCollection,
        visDefinitionModel: this.visDefinitionModel
      });
    });

    it('should not show infowindow', function () {
      expect(this.cdbLayer.infowindow.update).toHaveBeenCalledWith({
        alternative_names: {},
        autoPan: true,
        content: '',
        fields: [],
        headerColor: {},
        latlng: [0, 0],
        maxHeight: 180,
        offset: [28, 0],
        template: '',
        template_name: 'table/views/infowindow_light',
        visibility: false,
        width: 226
      });
    });

    describe('w/o fields', function () {
      beforeEach(function () {
        this.cdbLayer.infowindow.update.calls.reset();
        this.cdbLayer.infowindow = jasmine.createSpyObj('infowindow', ['update']);
      });

      describe('when template is changed', function () {
        beforeEach(function () {
          this.layerDefinitionsCollection.at(0).infowindowModel.set({
            'template_name': 'infowindow_light',
            'template': '<div class="CDB-infowindow"></div>'
          });
        });

        xit('should set a "none" template', function () {
          expect(this.cdbLayer.infowindow.update).toHaveBeenCalledWith({
            alternative_names: {},
            autoPan: true,
            content: '',
            fields: [{ name: 'cartodb_id', title: true, position: 0 }],
            headerColor: {},
            latlng: [0, 0],
            maxHeight: 180,
            offset: [28, 0],
            template: '<div class="CDB-infowindow Infowindow-none js-infowindow">\n  <div class="CDB-infowindow-close js-close"></div>\n  <div class="CDB-infowindow-container">\n    <div class="CDB-infowindow-bg">\n      <div class="CDB-infowindow-inner">\n        {{#loading}}\n          <div class="CDB-Loader js-loader is-visible"></div>\n        {{/loading}}\n        <ul class="CDB-infowindow-list">\n          <li class="CDB-infowindow-listItem">\n            <h5 class="CDB-infowindow-subtitle">Select fields</h5>\n            <h4 class="CDB-infowindow-title">You haven’t selected any fields to be shown in the infowindow.</h4>\n          </li>\n        </ul>\n      </div>\n    </div>\n    <div class="CDB-hook">\n      <div class="CDB-hook-inner"></div>\n    </div>\n  </div>\n</div>\n',
            template_name: 'infowindow_light',
            visibility: false,
            width: 226
          });
        });
      });
    });

    describe('w/ fields', function () {
      beforeEach(function () {
        this.layerDefinitionsCollection.at(0).infowindowModel.set({
          'fields': [
            {
              name: 'description',
              title: true,
              position: 0
            },
            {
              name: 'name',
              title: true,
              position: 1
            }
          ]
        });

        this.cdbLayer.infowindow.update.calls.reset();
        this.cdbLayer.infowindow = jasmine.createSpyObj('infowindow', ['update']);
      });

      describe('when template is changed', function () {
        beforeEach(function () {
          this.layerDefinitionsCollection.at(0).infowindowModel.set({
            'template_name': 'infowindow_light',
            'template': '<div class="CDB-infowindow"></div>'
          });
        });

        it('should update template', function () {
          expect(this.cdbLayer.infowindow.update).toHaveBeenCalledWith({
            alternative_names: {},
            autoPan: true,
            content: '',
            fields: [
              {
                name: 'description',
                title: true,
                position: 0
              },
              {
                name: 'name',
                title: true,
                position: 1
              }
            ],
            headerColor: {},
            latlng: [0, 0],
            maxHeight: 180,
            offset: [28, 0],
            template_name: 'infowindow_light',
            template: '<div class="CDB-infowindow"></div>',
            visibility: false,
            width: 226
          });
        });
      });

      describe('when both template and fields are changed', function () {
        beforeEach(function () {
          this.layerDefinitionsCollection.at(0).infowindowModel.set({
            'fields': [
              {
                name: 'description',
                title: true,
                position: 1
              },
              {
                name: 'name',
                title: true,
                position: 0
              }
            ],
            'template_name': 'infowindow_dark',
            'template': '<div class="CDB-infowindow CDB-infowindow--dark"></div>'
          });
        });

        it('should update fields and template', function () {
          expect(this.cdbLayer.infowindow.update).toHaveBeenCalledWith({
            alternative_names: {},
            autoPan: true,
            content: '',
            fields: [
              {
                name: 'description',
                title: true,
                position: 1
              },
              {
                name: 'name',
                title: true,
                position: 0
              }
            ],
            headerColor: {},
            latlng: [0, 0],
            maxHeight: 180,
            offset: [28, 0],
            template: '<div class="CDB-infowindow CDB-infowindow--dark"></div>',
            template_name: 'infowindow_dark',
            visibility: false,
            width: 226
          });
        });
      });
    });
  });

  describe('"syncing" of errors coming from cartodb.js models', function () {
    beforeEach(function () {
      this.cdbLayer = createFakeLayer({
        id: 'layer-id',
        error: {
          type: 'turbo-carto',
          context: {
            source: {
              start: {
                line: 99
              }
            }
          },
          message: 'something went wrong'
        }
      });
      this.cdbLayer.infowindow = jasmine.createSpyObj('infowindow', ['update']);

      this.layerDefinitionsCollection.resetByLayersData({
        id: 'layer-id',
        kind: 'carto',
        options: {
          table_name: 'infowindow_stuff',
          cartocss: ''
        },
        infowindow: {
          alternative_names: {},
          autoPan: true,
          content: '',
          fields: [],
          headerColor: {},
          latlng: [0, 0],
          maxHeight: 180,
          offset: [28, 0],
          template: '',
          template_name: 'table/views/infowindow_light',
          visibility: false,
          width: 226
        }
      });

      this.integrations2 = new DeepInsightsIntegrations({
        userModel: new Backbone.Model(),
        onboardings: createOnboardings(),
        deepInsightsDashboard: createFakeDashboard([ this.cdbLayer ]),
        analysisDefinitionsCollection: this.analysisDefinitionsCollection,
        analysisDefinitionNodesCollection: this.analysisDefinitionNodesCollection,
        layerDefinitionsCollection: this.layerDefinitionsCollection,
        widgetDefinitionsCollection: this.widgetDefinitionsCollection,
        visDefinitionModel: this.visDefinitionModel
      });
    });

    it('should set turbo-carto errors on the layerDefinitionModel if CartoDB.js layer had an error', function () {
      expect(this.layerDefinitionsCollection.at(0).get('error')).toEqual({
        type: 'turbo-carto',
        line: 99,
        message: 'something went wrong'
      });
    });

    it('should set turbo-carto errors on the layerDefinitionModel if CartoDB.js layer gets new errors', function () {
      this.cdbLayer.set('error', {
        type: 'turbo-carto',
        context: {
          source: {
            start: {
              line: 199
            }
          }
        },
        message: 'something went totally wrong'
      });

      expect(this.layerDefinitionsCollection.at(0).get('error')).toEqual({
        type: 'turbo-carto',
        line: 199,
        message: 'something went totally wrong'
      });
    });
  });
});
