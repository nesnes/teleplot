function getNodeWidth(node) {
  const nodeStyles = window.getComputedStyle(node, null);
  const width = node.offsetWidth;

  const borderLeftWidth = nodeStyles.borderLeftWidth
    ? parseFloat(nodeStyles.borderLeftWidth)
    : 0;

  const borderRightWidth = nodeStyles.borderRightWidth
    ? parseFloat(nodeStyles.borderRightWidth)
    : 0;

  const paddingLeft = nodeStyles.paddingLeft
    ? parseFloat(nodeStyles.paddingLeft)
    : 0;

  const paddingRight = nodeStyles.paddingRight
    ? parseFloat(nodeStyles.paddingRight)
    : 0;

  return (width - borderRightWidth - borderLeftWidth - paddingLeft - paddingRight);
}


function getNodeHeight(node) {
  const nodeStyles = window.getComputedStyle(node, null);
  const height = node.offsetHeight;

  const borderTopHeight = nodeStyles.borderTopHeight ? parseFloat(nodeStyles.borderTopHeight): 0;

  const borderBottomHeight = nodeStyles.borderBottomHeight ? parseFloat(nodeStyles.borderBottomHeight): 0;

  const paddingTop = nodeStyles.paddingTop ? parseFloat(nodeStyles.paddingTop): 0;

  const paddingBottom = nodeStyles.paddingBottom ? parseFloat(nodeStyles.paddingBottom): 0;

  return (height - borderBottomHeight - borderTopHeight - paddingTop - paddingBottom);
}

Vue.component('vue-responsive-text', {
  name: 'vue-responsive-text',
  props: {},
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
      this.currentWidth = getNodeWidth(this.$el);
      this.maxWidth = getNodeWidth(this.$el.parentElement);
      this.currentHeight = getNodeHeight(this.$el);
      this.maxHeight = getNodeHeight(this.$el.parentElement);
    },
    triggerTextResize()
    {
      this.updateNodeWidth();
      this.updateScale(this.currentWidth, this.maxWidth, this.currentHeight, this.maxHeight);
    }
  },
  mounted() {
    this.triggerTextResize();
  },
  updated() {
    this.triggerTextResize();
  },
  template:'<span v-bind:class="{ \'responsive-text-wrapper-center\' : textIsCenter }" :style="{ ...scaleStyle }"> <slot> </slot> </span>'
  //todo : SHOW responsive-text-wrapper-center if textIsCenter is true, and responsive-text-wrapper otherwise, (should be a prop)
});

