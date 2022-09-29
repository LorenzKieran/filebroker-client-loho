import React from 'react';
import {BrowserRouter, Location, NavigateFunction, NavLink, Route, Routes} from "react-router-dom";
import logo from './logo.svg';
import './App.css';
import http from "./http-common";
import PostSearch from './PostSearch';
import Login, {LoginResponse} from './Login';
import {ProfilePage} from "./ProfilePage";
import Register from './Register';
import Post from './Post';
import Home from './Home';
import { AxiosResponse } from 'axios';
import Modal from 'react-modal';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { solid } from '@fortawesome/fontawesome-svg-core/import.macro';
import UploadDialogue from './UploadDialogue';

export class User {
    user_name: string;
    email: string;
    avatar_url: string;
    creation_timestamp: string;

    constructor(
        user_name: string,
        email: string,
        avatar_url: string,
        creation_timestamp: string,
    ) {
        this.user_name = user_name;
        this.email = email;
        this.avatar_url = avatar_url;
        this.creation_timestamp = creation_timestamp;
    }
}

export class ModalContent {
    title: string;
    content: JSX.Element;
    closeCallback: ((result: any) => void) | undefined;

    constructor(title: string, content: JSX.Element, closeCallback: ((result: any) => void) | undefined) {
        this.title = title;
        this.content = content;
        this.closeCallback = closeCallback;
    }
}

export class App extends React.Component<{}, {
    jwt: string | null;
    user: User | null;
    loginExpiry: number | null;
    modalStack: ModalContent[];
}> {

    pendingLogin: Promise<AxiosResponse<LoginResponse, any>> | null;

    constructor(props: any) {
        super(props);
        this.state = {
            jwt: null,
            user: null,
            loginExpiry: null,
            modalStack: []
        };

        this.handleLogin = this.handleLogin.bind(this);

        this.pendingLogin = null;
    }

    render(): React.ReactNode {
        let loginAccountLink;
        if (this.state.user == null) {
            loginAccountLink = <NavLink to="/login">Log In</NavLink>;
        } else {
            loginAccountLink = <NavLink to="/profile">{this.state.user.user_name}</NavLink>;
        }

        const modalStyles = {
            content: {
                top: '50%',
                left: '50%',
                right: 'auto',
                bottom: 'auto',
                marginRight: '-50%',
                transform: 'translate(-50%, -50%)',
                backgroundColor: "#161b22",
                color: "white",
                padding: "10px"
            },
            overlay: {
                backgroundColor: "rgba(0, 0, 0, 0.75)",
                zIndex: 1000
            }
          };

        return (
            <BrowserRouter basename={process.env.REACT_APP_PATH ? process.env.REACT_APP_PATH : "/"}>
                <div className="App">
                    <div id="nav">
                        <div className="nav-el"><NavLink to="/">Home</NavLink></div>
                        <div className="nav-el"><NavLink to="/posts">Posts</NavLink></div>
                        <div className="nav-el nav-el-right">{loginAccountLink}</div>
                        <button className="nav-el nav-el-right" onClick={() => {
                            if (this.state.user == null) {
                                this.openModal("Error", <p>Must be logged in</p>);
                            } else {
                                this.openModal("Upload", <UploadDialogue app={this}></UploadDialogue>);
                            }
                        }}><FontAwesomeIcon icon={solid("cloud-arrow-up")} /> Upload</button>
                    </div>
                    {this.state.modalStack.map(modal => {
                        return <Modal isOpen={true} style={modalStyles} contentLabel={modal.title} key={modal.title}>
                            <div id="modal-title-row">
                                <button id="modal-close-btn" onClick={() => this.closeModal()}>
                                    <FontAwesomeIcon icon={solid("xmark")} size="2x" />
                                </button>
                                <span id="modal-title">{modal.title}</span>
                            </div>
                            <div id="modal-content">
                                {modal.content}
                            </div>
                        </Modal>
                    })}
                </div>
                <Routes>
                    <Route path="/" element={<Home></Home>}></Route>
                    <Route path="/posts" element={<PostSearch app={this}></PostSearch>}></Route>
                    <Route path="/login" element={<Login app={this}></Login>}></Route>
                    <Route path="/profile" element={<ProfilePage app={this} initialUser={this.state.user}></ProfilePage>}></Route>
                    <Route path="/register" element={<Register app={this}></Register>}></Route>
                    <Route path="/post/:id" element={<Post app={this}></Post>}></Route>
                    <Route path="*" element={<NotFoundPage></NotFoundPage>}></Route>
                </Routes>
            </BrowserRouter>
        );
    }

    async componentDidMount() {
        if (this.state.jwt != null) {
            return;
        }

        let promise;
        if (this.pendingLogin != null) {
            promise = this.pendingLogin;
        } else {
            promise = http.post<LoginResponse>("/try-refresh-login", null, { withCredentials: true });
            this.pendingLogin = promise;
        }

        try {
            let response = await promise;
            this.handleLogin(response.data);
        } catch (e) {
            console.log("Failed to refresh login: " + e);
            this.handleLogin(null);
        }
    }

    handleLogin(loginResponse: LoginResponse | null) {
        let loginExpiry;
        if (loginResponse) {
            loginExpiry = Date.now() + (loginResponse.expiration_secs - 10) * 1000;
        } else {
            loginExpiry = null;
        }

        this.setState({
            jwt: loginResponse?.token ?? null,
            user: loginResponse?.user ?? null,
            loginExpiry: loginExpiry
        }, () => {
            this.pendingLogin = null;
        });
    }

    async getAuthorization(location: Location, navigate: NavigateFunction): Promise<{headers: {authorization: string}}> {
        if (this.state.loginExpiry == null || this.state.jwt == null || this.state.loginExpiry < Date.now()) {
            let promise;
            if (this.pendingLogin != null) {
                promise = this.pendingLogin;
            } else {
                promise = http.post<LoginResponse>("/refresh-login", null, { withCredentials: true });
                this.pendingLogin = promise;
            }
            try {
                let response = await promise;
                this.handleLogin(response.data);
                if (!response.data) {
                    navigate("/login", { state: { from: location }, replace: true});
                    throw new Error("Failed to try refresh login with empty response");
                }
                return {
                    headers: {
                        authorization: `Bearer ${response.data.token}`
                    }
                };
            } catch (e: any) {
                console.log("Failed to refresh login: " + e);
                if (e.response?.status === 401) {
                    navigate("/login", { state: { from: location }, replace: true});
                }
                throw e;
            }
        } else {
            return {
                headers: {
                    authorization: `Bearer ${this.state.jwt}`
                }
            };
        }
    }

    openModal(title: string, modalElement: JSX.Element, closeCallback: ((result: any) => void) | undefined = undefined) {
        this.setState(state => {
            const newModalStack = state.modalStack.concat(new ModalContent(title, modalElement, closeCallback));
            return {
                modalStack: newModalStack
            }
        });
    }

    closeModal(result: any = undefined) {
        let callback = this.state.modalStack[this.state.modalStack.length - 1].closeCallback;
        if (callback) {
            callback(result);
        }
        this.setState(state => {
            const newModalStack = state.modalStack.slice(0, state.modalStack.length - 1);
            return {
                modalStack: newModalStack
            };
        });
    }
}

export class LoadingPage extends React.Component {
    constructor(props: any) {
        super(props);
    }

    render() {
        return (
            <div className="App">
                <header className="App-header">
                    <img src={logo} className="App-logo" alt="logo"/>
                    <h1>Loading</h1>
                </header>
            </div>
        );
    }
}

export class NotFoundPage extends React.Component {
    render(): React.ReactNode {
        return (
            <h1>404 Not Found</h1>
        );
    }
}

export default App;
