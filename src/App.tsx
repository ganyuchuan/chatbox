import React, { useEffect, useRef, useState, MutableRefObject } from 'react';
import Block from './Block'
import * as client from './client'
import SessionItem from './SessionItem'
import {
    Toolbar, Box, Badge, Snackbar,
    List, ListSubheader, ListItemText, MenuList,
    IconButton, Button, ButtonGroup, Stack, Grid, MenuItem, ListItemIcon, Typography, Divider,
    TextField, useTheme, useMediaQuery, debounce,
} from '@mui/material';
import { Session, createSession, Message, createMessage } from './types'
import useStore from './store'
import SettingWindow from './SettingWindow'
import ChatConfigWindow from './ChatConfigWindow'
import ChatBubbleOutlineOutlinedIcon from '@mui/icons-material/ChatBubbleOutlineOutlined';
import SettingsIcon from '@mui/icons-material/Settings';
import AddIcon from '@mui/icons-material/Add';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import * as prompts from './prompts';
import CleaningServicesIcon from '@mui/icons-material/CleaningServices';
import Save from '@mui/icons-material/Save'
import CleanWidnow from './CleanWindow';
import AboutWindow from './AboutWindow';
import { ThemeSwitcherProvider } from './theme/ThemeSwitcher';
import { useTranslation } from "react-i18next";
import appicon from './appicon.png'
import beianicon from './beian.png'
import { save } from '@tauri-apps/api/dialog';
import { writeTextFile } from '@tauri-apps/api/fs';
import ArrowCircleUpIcon from '@mui/icons-material/ArrowCircleUp';
import ArrowCircleDownIcon from '@mui/icons-material/ArrowCircleDown';
import SponsorChip from './SponsorChip'
import "./styles/App.scss"
import MenuOpenIcon from '@mui/icons-material/MenuOpen';
import SendIcon from '@mui/icons-material/Send';

import type { DragEndEvent } from '@dnd-kit/core';
import {
    DndContext,
    KeyboardSensor,
    MouseSensor,
    TouchSensor,
    closestCenter,
    useSensor,
    useSensors,
} from '@dnd-kit/core';
import {
    SortableContext,
    arrayMove,
    sortableKeyboardCoordinates,
    verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { restrictToVerticalAxis } from '@dnd-kit/modifiers'
import { SortableItem } from './SortableItem';
import { createTheme, useThemeProps } from '@mui/material/styles';
import { purple } from '@mui/material/colors';

const theme = createTheme({
  palette: {
    primary: {
      main: purple[500],
    },
    secondary: {
      main: '#f44336',
    },
  },
});


function Main() {
    const { t } = useTranslation()
    const store = useStore()
    const sensors = useSensors(
        useSensor(TouchSensor, {
            activationConstraint: {
                delay: 250,
                tolerance: 5,
            },
        }),
        useSensor(MouseSensor, {
            activationConstraint: {
                distance: 10,
            },
        }),
        useSensor(KeyboardSensor, {
            coordinateGetter: sortableKeyboardCoordinates,
        })
    );

    const sortedSessions = sortSessions(store.chatSessions)
    function handleDragEnd(event: DragEndEvent) {
        const { active, over } = event;
        if (!over) {
            return
        }
        if (active.id !== over.id) {
            const oldIndex = sortedSessions.findIndex(({ id }) => id === active.id);
            const newIndex = sortedSessions.findIndex(({ id }) => id === over.id);
            const newReversed = arrayMove(sortedSessions, oldIndex, newIndex);
            store.setSessions(sortSessions(newReversed))
        }
    }

    // 是否展示设置窗口
    const [openSettingWindow, setOpenSettingWindow] = React.useState(false);
    useEffect(() => {
        if (store.needSetting) {
            setOpenSettingWindow(true)
        }
    }, [store.needSetting])

    // 是否展示相关信息的窗口
    const [openAboutWindow, setOpenAboutWindow] = React.useState(false);

    // 是否展示菜单栏
    const theme = useTheme();
    const isSmallScreen = useMediaQuery(theme.breakpoints.down('sm'));
    const [showMenu, setShowMenu] = React.useState(!isSmallScreen);

    const messageListRef = useRef<HTMLDivElement>(null)
    const messageScrollRef = useRef<{ msgId: string, smooth?: boolean } | null>(null)
    useEffect(() => {
        if (!messageScrollRef.current) {
            return
        }
        if (!messageListRef.current) {
            return
        }
        const container = messageListRef.current
        const element = document.getElementById(messageScrollRef.current.msgId)
        if (!container || !element) {
            return
        }
        const elementRect = element.getBoundingClientRect();
        const containerRect = container.getBoundingClientRect();
        const isInsideLeft = elementRect.left >= containerRect.left;
        const isInsideRight = elementRect.right <= containerRect.right;
        const isInsideTop = elementRect.top >= containerRect.top;
        const isInsideBottom = elementRect.bottom <= containerRect.bottom;
        if (isInsideLeft && isInsideRight && isInsideTop && isInsideBottom) {
            return
        }
        // 平滑滚动
        element.scrollIntoView({
            behavior: messageScrollRef.current.smooth ? 'smooth' : 'auto',
            block: 'end',
            inline: 'nearest',
        })
    })
    // stop auto-scroll when user scroll
    useEffect(() => {
        if (!messageListRef.current) {
            return
        }
        messageListRef.current.addEventListener('wheel', function (e: any) {
            messageScrollRef.current = null
        });
    }, [])

    // 切换到当前会话，自动滚动到最后一条消息
    useEffect(() => {
        messageListToBottom();
    }, [store.currentSession.id])

    // show scroll to top or bottom button when user scroll
    const [atScrollTop, setAtScrollTop] = React.useState(false);
    const [atScrollBottom, setAtScrollBottom] = React.useState(false);
    const [needScroll, setNeedScroll] = React.useState(false);
    useEffect(() => {
        if (!messageListRef.current) {
            return
        }
        const handleScroll = () => {
            if (!messageListRef.current) {
                return
            }
            const { scrollTop, scrollHeight, clientHeight } = messageListRef.current;
            if (scrollTop === 0) {
                setAtScrollTop(true);
                setAtScrollBottom(false);
            } else if (scrollTop + clientHeight === scrollHeight) {
                setAtScrollTop(false);
                setAtScrollBottom(true);
            } else {
                setAtScrollTop(false);
                setAtScrollBottom(false);
            }
            setNeedScroll(scrollHeight > clientHeight);
          };

          handleScroll();
          messageListRef.current.addEventListener("scroll", debounce(handleScroll, 100));
    }, []);
    const messageListToTop = () => {
        if (!messageListRef.current) {
            return
        }
        messageListRef.current.scrollTop = 0;
    };
    const messageListToBottom = () => {
        if (!messageListRef.current) {
            return
        }
        messageListRef.current.scrollTop = messageListRef.current.scrollHeight;
    };

    const codeBlockCopyEvent = useRef((e: Event) => {
        const target: HTMLElement = e.target as HTMLElement;

        const isCopyActionClassName = target.className === 'copy-action';
        const isCodeBlockParent = target.parentElement?.parentElement?.className === 'code-block-wrapper';

        // check is copy action button
        if (!(isCopyActionClassName && isCodeBlockParent)) {
            return;
        }

        // got codes
        const content = target?.parentNode?.parentNode?.querySelector('code')?.innerText ?? '';

        // do copy
        // * thats lines copy from copy block content action
        navigator.clipboard.writeText(content);
        store.addToast(t('copied to clipboard'));
    });

    // bind code block copy event on mounted
    useEffect(() => {
        document.addEventListener('click', codeBlockCopyEvent.current);

        return () => {
            document.removeEventListener('click', codeBlockCopyEvent.current);
        };
    }, []);

    const [configureChatConfig, setConfigureChatConfig] = React.useState<Session | null>(null);

    const [sessionClean, setSessionClean] = React.useState<Session | null>(null);

    const editCurrentSession = () => {
        setConfigureChatConfig(store?.currentSession)
    };
    const generateName = async (session: Session) => {
        client.replay(
            store.settings.openaiKey,
            store.settings.apiHost,
            store.settings.maxContextSize,
            store.settings.maxTokens,
            store.settings.model,
            store.settings.temperature,
            prompts.nameConversation(session.messages.slice(0, 3)),
            ({ text: name }) => {
                name = name.replace(/['"“”]/g, '')
                session.name = name
                store.updateChatSession(session)
            },
            (err) => {
                console.log(err)
            }
        )
    }
    const saveSession = async (session: Session) => {
        const filePath = await save({
            filters: [{
                name: 'Export',
                extensions: ['md']
            }]
        });
        if (filePath) {
            const content = session.messages
                .map(msg => `**${msg.role}**:\n${msg.content}`)
                .join('\n\n--------------------\n\n')
            await writeTextFile(filePath!!, content)
        }
    }

    const generate = async (session: Session, promptMsgs: Message[], targetMsg: Message) => {
        messageScrollRef.current = { msgId: targetMsg.id, smooth: false }
        await client.replay(
            store.settings.openaiKey,
            store.settings.apiHost,
            store.settings.maxContextSize,
            store.settings.maxTokens,
            store.settings.model,
            store.settings.temperature,
            promptMsgs,
            ({ text, cancel }) => {
                for (let i = 0; i < session.messages.length; i++) {
                    if (session.messages[i].id === targetMsg.id) {
                        session.messages[i] = {
                            ...session.messages[i],
                            content: text,
                            cancel,
                            model: store.settings.model,
                            generating: true
                        }
                        break;
                    }
                }
                store.updateChatSession(session)
            },
            (err) => {
                for (let i = 0; i < session.messages.length; i++) {
                    if (session.messages[i].id === targetMsg.id) {
                        session.messages[i] = {
                            ...session.messages[i],
                            content: t('api request failed:') + ' \n```\n' + err.message + '\n```',
                            model: store.settings.model,
                            generating: false
                        }
                        break
                    }
                }
                store.updateChatSession(session)
            }
        )
        for (let i = 0; i < session.messages.length; i++) {
            if (session.messages[i].id === targetMsg.id) {
                session.messages[i] = {
                    ...session.messages[i],
                    generating: false
                }
                break
            }
        }
        store.updateChatSession(session)

        messageScrollRef.current = null
    }

    const [quoteCache, setQuoteCache] = useState('')

    const sessionListRef = useRef<HTMLDivElement>(null)
    const handleCreateNewSession = () => {
        store.createEmptyChatSession()
        if (sessionListRef.current) {
            sessionListRef.current.scrollTo(0, 0)
        }
    }

    const textareaRef = useRef<HTMLTextAreaElement>(null);

    return (
        <Box className='App'>
            <Grid container sx={{
                height: '100%',
            }}>
                <Grid item xs
                    sx={{
                        width: '0px',
                        height: '100%',
                    }}
                >
                    <Stack sx={{
                        height: '100%',
                        position: 'relative',
                    }} >
                        <Toolbar style={{padding: '0'}}>
                            <IconButton>
                                <img src={appicon} style={{ width: '40px', height: '40px' }} />
                            </IconButton>
                            <Typography variant="h6" color="inherit" component="div" noWrap
                                sx={{
                                    flex: 1,
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                }}
                            >
                                <span style={{ cursor: 'pointer', paddingLeft: '16px' }}>
                                    {t('Completions')}
                                </span>
                            </Typography>
                            <SponsorChip sessionId={store.currentSession.id} />
                            <IconButton edge="start" color="inherit" aria-label="menu" sx={{ mr: 2 }}
                                onClick={() => setSessionClean(store.currentSession)}
                            >
                                <CleaningServicesIcon />
                            </IconButton>
                            <IconButton edge="start" color="inherit" aria-label="menu" sx={{ mr: 2 }}
                                onClick={() => saveSession(store.currentSession)}
                            >
                                <Save />
                            </IconButton>
                            <IconButton edge="start" color="inherit" aria-label="menu" sx={{}}
                                onClick={() => {
                                setOpenSettingWindow(true)
                            }}>
                                <SettingsIcon />
                            </IconButton>
                        </Toolbar>
                        <List
                            className='scroll'
                            sx={{
                                bgcolor: 'background.paper',
                                overflow: 'auto',
                                '& ul': { padding: 0 },
                                height: '100%',
                            }}
                            component="div"
                            ref={messageListRef}
                        >
                            {
                                store.currentSession.messages.map((msg, ix) => (
                                    <Block id={msg.id} key={msg.id} msg={msg}
                                        showWordCount={store.settings.showWordCount || false}
                                        showTokenCount={store.settings.showTokenCount || false}
                                        showModelName={store.settings.showModelName || false}
                                        setMsg={(updated) => {
                                            store.currentSession.messages = store.currentSession.messages.map((m) => {
                                                if (m.id === updated.id) {
                                                    return updated
                                                }
                                                return m
                                            })
                                            store.updateChatSession(store.currentSession)
                                        }}
                                        delMsg={() => {
                                            store.currentSession.messages = store.currentSession.messages.filter((m) => m.id !== msg.id)
                                            store.updateChatSession(store.currentSession)
                                        }}
                                        refreshMsg={() => {
                                            if (msg.role === 'assistant') {
                                                const promptMsgs = store.currentSession.messages.slice(0, ix)
                                                generate(store.currentSession, promptMsgs, msg)
                                            } else {
                                                const promptsMsgs = store.currentSession.messages.slice(0, ix + 1)
                                                const newAssistantMsg = createMessage('assistant', '....')
                                                const newMessages = [...store.currentSession.messages]
                                                newMessages.splice(ix + 1, 0, newAssistantMsg)
                                                store.currentSession.messages = newMessages
                                                store.updateChatSession(store.currentSession)
                                                generate(store.currentSession, promptsMsgs, newAssistantMsg)
                                                messageScrollRef.current = { msgId: newAssistantMsg.id, smooth: true }
                                            }
                                        }}
                                        copyMsg={() => {
                                            navigator.clipboard.writeText(msg.content)
                                            store.addToast(t('copied to clipboard'))
                                        }}
                                        quoteMsg={() => {
                                            let input = msg.content.split('\n').map((line: any) => `> ${line}`).join('\n')
                                            input += '\n\n-------------------\n\n'
                                            setQuoteCache(input)
                                        }}
                                    />
                                ))
                            }
                        </List>
                        <Box sx={{ padding: '20px 0', position: 'relative', }}>
                            {(needScroll && <ButtonGroup
                                sx={{
                                    position: 'absolute',
                                    right: '0.2rem',
                                    top: '-5.5rem',
                                    opacity: 0.6,
                                }}
                                orientation="vertical"
                            >
                                <IconButton 
                                    onClick={() => messageListToTop()} 
                                    sx={{visibility: atScrollTop ? "hidden" : "visible",}}>
                                    <ArrowCircleUpIcon />
                                </IconButton>
                                <IconButton 
                                    onClick={() => messageListToBottom()}
                                    sx={{visibility: atScrollBottom ? "hidden" : "visible",}}>
                                    <ArrowCircleDownIcon />
                                </IconButton>
                            </ButtonGroup>)}
                            <MessageInput
                                quoteCache={quoteCache}
                                setQuotaCache={setQuoteCache}
                                onSubmit={async (newUserMsg: Message, needGenerating = true) => {
                                    if (needGenerating) {
                                        const promptsMsgs = [...store.currentSession.messages, newUserMsg]
                                        const newAssistantMsg = createMessage('assistant', '....')
                                        store.currentSession.messages = [...store.currentSession.messages, newUserMsg, newAssistantMsg]
                                        store.updateChatSession(store.currentSession)
                                        generate(store.currentSession, promptsMsgs, newAssistantMsg)
                                        messageScrollRef.current = { msgId: newAssistantMsg.id, smooth: true }
                                    } else {
                                        store.currentSession.messages = [...store.currentSession.messages, newUserMsg]
                                        store.updateChatSession(store.currentSession)
                                        messageScrollRef.current = { msgId: newUserMsg.id, smooth: true }
                                    }
                                }}
                                textareaRef={textareaRef}
                            />
                        </Box>
                    </Stack>
                </Grid>

                <SettingWindow open={openSettingWindow}
                    settings={store.settings}
                    save={(settings) => {
                        store.setSettings(settings)
                        setOpenSettingWindow(false)
                        if (settings.fontSize !== store.settings.fontSize) {
                            store.addToast(t('font size changed, effective after next launch'))
                        }
                    }}
                    close={() => setOpenSettingWindow(false)}
                />
                <AboutWindow open={openAboutWindow} version={store.version} lang={store.settings.language}
                    close={() => setOpenAboutWindow(false)}
                />
                {
                    configureChatConfig !== null && (
                        <ChatConfigWindow open={configureChatConfig !== null}
                            session={configureChatConfig}
                            save={(session) => {
                                store.updateChatSession(session)
                                setConfigureChatConfig(null)
                            }}
                            close={() => setConfigureChatConfig(null)}
                        />
                    )
                }
                {
                    sessionClean !== null && (
                        <CleanWidnow open={sessionClean !== null}
                            session={sessionClean}
                            save={(session) => {
                                sessionClean.messages.forEach((msg) => {
                                    msg?.cancel?.();
                                });

                                store.updateChatSession(session)
                                setSessionClean(null)
                            }}
                            close={() => setSessionClean(null)}
                        />
                    )
                }
                {
                    store.toasts.map((toast) => (
                        <Snackbar
                            key={toast.id}
                            open
                            onClose={() => store.removeToast(toast.id)}
                            message={toast.content}
                            anchorOrigin={{ vertical: 'top', horizontal: 'right' }}
                        />
                    ))
                }
            </Grid>
        </Box >
    );
}

function MessageInput(props: {
    onSubmit: (newMsg: Message, needGenerating?: boolean) => void
    quoteCache: string
    setQuotaCache(cache: string): void
    textareaRef: MutableRefObject<HTMLTextAreaElement | null>
}) {
    const { t } = useTranslation()
    const [messageInput, setMessageInput] = useState('')
    useEffect(() => {
        if (props.quoteCache !== '') {
            setMessageInput(props.quoteCache)
            props.setQuotaCache('')
            props.textareaRef?.current?.focus()
        }
    }, [props.quoteCache])
    const submit = (needGenerating = true) => {
        if (messageInput.trim() === '') {
            return
        }
        props.onSubmit(createMessage('user', messageInput), needGenerating)
        setMessageInput('')
    }
    useEffect(() => {
        function keyboardShortcut(e: KeyboardEvent) {
            if (e.key === 'i' && (e.metaKey || e.ctrlKey)) {
                props.textareaRef?.current?.focus();
            }
        }
        window.addEventListener('keydown', keyboardShortcut);
        return () => {
            window.removeEventListener('keydown', keyboardShortcut)
        }
    }, [])

    return (
        <form  onSubmit={(e) => {
            e.preventDefault()
            submit()
        }}>
            <Stack direction="column" spacing={1} >
                <Grid container spacing={1}>
                    <Grid item xs>
                        <TextField
                            inputRef={props.textareaRef}
                            multiline
                            label="Prompt"
                            value={messageInput}
                            onChange={(event) => setMessageInput(event.target.value)}
                            fullWidth
                            maxRows={12}
                            autoFocus
                            id='message-input'
                            onKeyDown={(event) => {
                                if (event.keyCode === 13 && !event.shiftKey && !event.ctrlKey && !event.altKey && !event.metaKey) {
                                    event.preventDefault()
                                    submit()
                                    return
                                }
                                if (event.keyCode === 13 && event.ctrlKey) {
                                    event.preventDefault()
                                    submit(false)
                                    return
                                }
                            }}
                        />
                    </Grid>
                    <Grid item xs='auto'>
                        <Button type='submit' variant="contained" size='large' style={{ padding: '15px 16px' }}>
                            <SendIcon />
                        </Button>
                    </Grid>
                </Grid>
                <Typography variant='caption' style={{ opacity: 0.3, display: 'flex', width: '100%', justifyContent: 'space-between' }}>
                    <p>{t('[Enter] send, [Shift+Enter] line break, [Ctrl+Enter] send without generating')}</p>
                    <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', minWidth: '331px' }}>
                        <a href="http://www.beian.gov.cn/portal/registerSystemInfo?recordcode=11010502053418" target="_blank" style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', marginRight: '20px' }}>
                            <img src={beianicon} /><p>京公网安备 11010502053418号</p>
                        </a>
                        <a href="https://beian.miit.gov.cn/" target="_blank">京ICP备2023021980号-1</a>
                    </div>
                </Typography>
            </Stack>
        </form>
    )
}

function sortSessions(sessions: Session[]): Session[] {
    let reversed: Session[] = []
    let pinned: Session[] = []
    for (const sess of sessions) {
        if (sess.starred) {
            pinned.push(sess)
            continue
        }
        reversed.unshift(sess)
    }
    return pinned.concat(reversed)
}

export default function App() {
    return (
        <ThemeSwitcherProvider>
            <Main />
        </ThemeSwitcherProvider>
    )
}
