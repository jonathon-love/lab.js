import React, { Component, createRef } from 'react'
import PropTypes from 'prop-types'

import ReactDOM from 'react-dom'
import { clamp, sortBy } from 'lodash'
import { Stage } from 'react-konva'
import { actions } from 'react-redux-form'

import BackgroundLayer from './backgroundLayer'
import ItemLayer from './itemLayer'
import ItemForm from './itemForm'

class TimelineStage extends Component {
  constructor() {
    super()
    this.state = {
      width: 0,
      activeItem: undefined,
    }

    // Bindings
    this.calcPosition = this.calcPosition.bind(this)
    this.closestLayerY = this.closestLayerY.bind(this)
    this.setActive = this.setActive.bind(this)
    this.setCursor = this.setCursor.bind(this)
    this.handleChange = this.handleChange.bind(this)
    this.updateItem = this.updateItem.bind(this)
    this.handleAdd = this.handleAdd.bind(this)
    this.handleDuplicateCurrent = this.handleDuplicateCurrent.bind(this)
    this.handleDeleteCurrent = this.handleDeleteCurrent.bind(this)

    // Refs
    this.stage = createRef()
  }

  componentDidMount() {
    // Calculate available space
    const parent = ReactDOM.findDOMNode(this).parentNode
    this.setState({
      width: parent.clientWidth,
    })
  }

  getChildContext() {
    return {
      range: this.props.range,
      width: this.state.width,
      height: this.props.height,
      padding: this.props.padding,
      calcPosition: this.calcPosition,
      closestLayerY: this.closestLayerY,
      setCursor: this.setCursor,
    }
  }

  // Position math -------------------------------------------------------------

  calcPosition(start, stop, layer) {
    return {
      x: parseInt(start),
      y: this.layerY(layer),
      w: parseInt(stop) - parseInt(start),
    }
  }

  closestLayer(y) {
    const clampedY = clamp(y,
      this.props.padding,
      this.props.height - 3 * this.props.padding
    )

    return Math.round(
      (clampedY - this.props.padding) /
      (this.props.layerHeight + this.props.layerGutter)
    )
  }

  closestLayerY(y) {
    return this.layerY(this.closestLayer(y))
  }

  layerY(layer) {
    return layer * (this.props.layerHeight + this.props.layerGutter) +
      this.props.padding
  }

  suggestPosition(item, defaultLength=100) {
    const sortedItems = sortBy(
      this.props.data.timeline,
      [i => i.start, i => i.priority]
    )
    const nLayers = this.closestLayer(this.props.height) + 1

    const lastEntry = sortedItems.length > 0
      ? sortedItems[sortedItems.length - 1]
      : { stop: 0, priority: -1 }

    return {
      ...item,
      start: item.start || lastEntry.stop,
      stop: item.stop || lastEntry.stop + defaultLength,
      priority: item.priority || (lastEntry.priority + 1) % nLayers,
    }
  }

  // UI interaction ------------------------------------------------------------

  setActive(item) {
    if (item !== this.state.activeItem) {
      this.setState({ activeItem: item })
      this.props.formDispatch(
        actions.load(
          `local.timeline[${ item }]`,
          this.props.data.timeline[this.state.activeItem]
        )
      )
    }
  }

  setCursor(cursor) {
    this.stage.current.container().style.cursor = cursor
  }

  // Store/form interaction ----------------------------------------------------

  handleChange(model, value) {
    // TODO: This has a hackish feel to it
    this.props.formDispatch(
      actions.change(
        `local.timeline[${ this.state.activeItem }].${ model }`,
        value
      )
    )
  }

  updateItem(item, { x, y, width }) {
    this.context.store.dispatch({
      type: 'UPDATE_TIMELINE_ITEM',
      id: this.context.id,
      item,
      data: {
        start: x,
        stop: x + width,
        priority: this.closestLayer(y)
      }
    })
    // TODO: This is a hack!
    this.props.formDispatch(
      actions.load(
        `local.timeline[${ item }].start`, x
      )
    )
    this.props.formDispatch(
      actions.load(
        `local.timeline[${ item }].stop`, x + width
      )
    )
    this.props.formDispatch(
      actions.load(
        `local.timeline[${ item }].priority`,
        this.closestLayer(y)
      )
    )
  }

  handleAdd(item) {
    this.props.formDispatch(
      actions.push(
        'local.timeline', this.suggestPosition(item)
      )
    )

    // This is a hack: If called in sequence,
    // the newly added item is not yet available in the timeline
    setTimeout(
      () => this.setState({
        activeItem: this.props.data.timeline.length - 1
      }),
      0
    )
  }

  handleDuplicateCurrent() {
    if (this.state.activeItem !== undefined) {
      this.handleAdd({
        ...this.props.data.timeline[this.state.activeItem],
        // Remove location information
        start: undefined, stop: undefined, priority: undefined
      })
    }
  }

  handleDeleteCurrent() {
    if (this.state.activeItem !== undefined) {
      this.props.formDispatch(
        actions.remove(
          'local.timeline', this.state.activeItem
        )
      )
      this.setState({ activeItem: undefined })
    }
  }

  render() {
    const { width } = this.state
    const { data, height, range, padding } = this.props

    return (
      <>
        <Stage
          ref={ this.stage }
          width={ width } height={ height }
          offsetX={ -padding }
          draggable={ true }
          dragBoundFunc={ ({ x }) => ({
            x: clamp(x,
              // Sign reversed because the right-hand side
              // is dragged leftward, and vice versa.
              -(range.max - width + padding),
              -(range.min + padding)
            ),
            y: 0
          }) }
        >
          <BackgroundLayer
            listening={ false }
          />
          <ItemLayer
            timeline={ data.timeline || [] }
            updateItem={ this.updateItem }
            activeItem={ this.state.activeItem }
            setActive={ this.setActive }
          />
        </Stage>
        <ItemForm
          timeline={ data.timeline || [] }
          handleChange={ this.handleChange }
          updateItem={ this.updateItem }
          activeItem={ this.state.activeItem }
          setActive={ this.setActive }
          add={ this.handleAdd }
          duplicateCurrent={ this.handleDuplicateCurrent }
          deleteCurrent={ this.handleDeleteCurrent }
        />
      </>
    )
  }
}

TimelineStage.defaultProps = {
  height: 200,
  padding: 20,
  layerHeight: 30,
  layerGutter: 20,
  range: { min: -100, max: 2000 },
}

TimelineStage.contextTypes = {
  store: PropTypes.object,
  id: PropTypes.oneOfType([
    PropTypes.string,
    PropTypes.number,
  ]),
}

TimelineStage.childContextTypes = {
  range: PropTypes.object,
  width: PropTypes.number,
  height: PropTypes.number,
  padding: PropTypes.number,
  calcPosition: PropTypes.func,
  closestLayerY: PropTypes.func,
  setCursor: PropTypes.func,
}

export default TimelineStage
