function getNodeSize(node)// node : the html element we want to measure
{
  const nodeStyles = window.getComputedStyle(node, null);

  let convertToFloat = (nb_str) => { return nb_str?parseFloat(nb_str):0 };

  return {
    width : (node.offsetWidth - convertToFloat(nodeStyles.borderLeftWidth) - convertToFloat(nodeStyles.borderRightWidth) 
    - convertToFloat(nodeStyles.paddingLeft) - convertToFloat(nodeStyles.paddingRight)),

    height : (node.offsetHeight - convertToFloat(nodeStyles.borderTopHeight) - convertToFloat(nodeStyles.borderBottomHeight) 
    - convertToFloat(nodeStyles.paddingTop) - convertToFloat(nodeStyles.paddingBottom))
  }

}

Vue.component('vue-responsive-text', {
  name: 'vue-responsive-text',
  props: {
    isTelem: {type: Boolean, required: false},
    isUnit: {type: Boolean, required: false},
    isValue: {type: Boolean, required: false},
  },
  data() {
    return {
      scale: 1,
      currentWidth: null,
      maxWidth: null,
      currentHeight: null,
      maxHeight: null,
    };
  },
  computed: {
    scaleStyle() {
      const scaleValue = `scale(${this.scale}, ${this.scale})`;
      return {
        msTransform: scaleValue,
        WebkitTransform: scaleValue,
        OTransform: scaleValue,
        MozTransform: scaleValue,
        transform: scaleValue
      };
    },
  },
  methods: {
    updateScale(currentWidth, maxWidth, currentHeight, maxHeight) {
      this.scale = Math.min(maxWidth / currentWidth, maxHeight/ currentHeight);
    },
    updateNodeWidth() {
      let parentNodeSize = getNodeSize(this.$el.parentElement);
      let thisNodeSize = getNodeSize(this.$el);

      this.currentWidth = thisNodeSize.width;
      this.maxWidth = parentNodeSize.width;
      this.currentHeight = thisNodeSize.height;
      this.maxHeight = parentNodeSize.height;
    },
    triggerTextResize()
    {
      this.updateNodeWidth();
      this.updateScale(this.currentWidth, this.maxWidth, this.currentHeight, this.maxHeight);
    }
  },
  
  template:'<span id="current-responsive-text-wrapper"\
            v-bind:class="{ \'responsive-text-wrapper-telem\' : isTelem, \'responsive-text-wrapper-unit\' : isUnit, \'responsive-text-wrapper-value\' : isValue }"\
            :style="{ ...scaleStyle }"> \
                <slot></slot> \
            </span>'
});

