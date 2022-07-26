// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.
import React, {useMemo} from 'react'
import {FormattedMessage} from 'react-intl'

import {Board, IPropertyTemplate} from '../../blocks/board'
import {Card} from '../../blocks/card'
import {ContentBlock} from '../../blocks/contentBlock'
import {useSortable} from '../../hooks/sortable'
import mutator from '../../mutator'
import {getCardContents} from '../../store/contents'
import {useAppSelector} from '../../store/hooks'
import TelemetryClient, {TelemetryActions, TelemetryCategory} from '../../telemetry/telemetryClient'
import IconButton from '../../widgets/buttons/iconButton'
import OptionsIcon from '../../widgets/icons/options'
import MenuWrapper from '../../widgets/menuWrapper'
import Tooltip from '../../widgets/tooltip'
import {CardDetailProvider} from '../cardDetail/cardDetailContext'
import ContentElement from '../content/contentElement'
import ImageElement from '../content/imageElement'
import PropertyValueElement from '../propertyValueElement'
import './galleryCard.scss'
import CardBadges from '../cardBadges'
import CardActionsMenu from '../cardActionsMenu/cardActionsMenu'

type Props = {
    board: Board
    card: Card
    onClick: (e: React.MouseEvent, card: Card) => void
    visiblePropertyTemplates: IPropertyTemplate[]
    visibleTitle: boolean
    isSelected: boolean
    visibleBadges: boolean
    readonly: boolean
    isManualSort: boolean
    onDrop: (srcCard: Card, dstCard: Card) => void
}

const GalleryCard = (props: Props) => {
    const {card, board} = props
    const [isDragging, isOver, cardRef] = useSortable('card', card, props.isManualSort && !props.readonly, props.onDrop)
    const contents = useAppSelector(getCardContents(card.id))

    const visiblePropertyTemplates = props.visiblePropertyTemplates || []

    const image: ContentBlock|undefined = useMemo(() => {
        for (let i = 0; i < contents.length; ++i) {
            if (Array.isArray(contents[i])) {
                return (contents[i] as ContentBlock[]).find((c) => c.type === 'image')
            } else if ((contents[i] as ContentBlock).type === 'image') {
                return contents[i] as ContentBlock
            }
        }
        return undefined
    }, [contents])

    let className = props.isSelected ? 'GalleryCard selected' : 'GalleryCard'
    if (isOver) {
        className += ' dragover'
    }

    return (
        <div
            className={className}
            onClick={(e: React.MouseEvent) => props.onClick(e, card)}
            style={{opacity: isDragging ? 0.5 : 1}}
            ref={cardRef}
        >
            {!props.readonly &&
                <MenuWrapper
                    className='optionsMenu'
                    stopPropagationOnToggle={true}
                >
                    <IconButton icon={<OptionsIcon/>}/>
                    <CardActionsMenu
                        cardId={card!.id}
                        onClickDelete={() => mutator.deleteBlock(card, 'delete card')}
                        onClickDuplicate={() => {
                            TelemetryClient.trackEvent(TelemetryCategory, TelemetryActions.DuplicateCard, {board: board.id, card: card.id})
                            mutator.duplicateCard(card.id, board.id)
                        }}
                    />
                </MenuWrapper>
            }

            {image &&
                <div className='gallery-image'>
                    <ImageElement block={image}/>
                </div>}
            {!image &&
                <CardDetailProvider card={card}>
                    <div className='gallery-item'>
                        {contents.map((block) => {
                            if (Array.isArray(block)) {
                                return block.map((b) => (
                                    <ContentElement
                                        key={b.id}
                                        block={b}
                                        readonly={true}
                                        cords={{x: 0}}
                                    />
                                ))
                            }

                            return (
                                <ContentElement
                                    key={block.id}
                                    block={block}
                                    readonly={true}
                                    cords={{x: 0}}
                                />
                            )
                        })}
                    </div>
                </CardDetailProvider>}
            {props.visibleTitle &&
                <div className='gallery-title'>
                    { card.fields.icon ? <div className='octo-icon'>{card.fields.icon}</div> : undefined }
                    <div
                        key='__title'
                        className='octo-titletext'
                    >
                        {card.title ||
                            <FormattedMessage
                                id='KanbanCard.untitled'
                                defaultMessage='Untitled'
                            />}
                    </div>
                </div>}
            {visiblePropertyTemplates.length > 0 &&
                <div className='gallery-props'>
                    {visiblePropertyTemplates.map((template) => (
                        <Tooltip
                            key={template.id}
                            title={template.name}
                            placement='top'
                        >
                            <PropertyValueElement
                                board={board}
                                readOnly={true}
                                card={card}
                                propertyTemplate={template}
                                showEmptyPlaceholder={false}
                            />
                        </Tooltip>
                    ))}
                </div>}
            {props.visibleBadges &&
                <CardBadges
                    card={card}
                    className='gallery-badges'
                />}
        </div>
    )
}

export default React.memo(GalleryCard)
